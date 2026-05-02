<?php
// Ativa tipagem estrita.
declare(strict_types=1);

// Carrega configuracao e funcoes.
require_once __DIR__ . '/config.php';

// Aceita somente POST para webhook.
if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    jsonResponse(405, ['ok' => false, 'error' => 'Metodo nao permitido.']);
}

try {
    // Lê token enviado pelo Asaas no header.
    $tokenRecebido = getWebhookTokenFromHeader();

    // Valida token para garantir origem legitima do webhook.
    if ($tokenRecebido === '' || !hash_equals(ASAAS_WEBHOOK_TOKEN, $tokenRecebido)) {
        jsonResponse(401, ['ok' => false, 'error' => 'Token de webhook invalido.']);
    }

    // Le payload JSON do webhook.
    $body = getJsonBody();

    // Extrai id do evento.
    $eventId = trim((string)($body['id'] ?? ''));

    // Extrai nome do evento.
    $event = strtoupper(trim((string)($body['event'] ?? '')));

    // Extrai objeto payment.
    $payment = isset($body['payment']) && is_array($body['payment']) ? $body['payment'] : [];

    // Extrai id da cobranca no Asaas.
    $asaasPaymentId = trim((string)($payment['id'] ?? ''));

    // Extrai externalReference usado na criacao da cobranca.
    $externalReference = trim((string)($payment['externalReference'] ?? ''));

    // Se vier sem identificadores, ignora com erro de validacao.
    if ($asaasPaymentId === '' && $externalReference === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'Webhook sem identificador de pagamento.']);
    }

    // Conecta ao banco.
    $pdo = db();

    // Inicia transacao para bloquear concorrencia e evitar duplicidade.
    $pdo->beginTransaction();

    // Busca deposito pelo payment id (preferencial) com lock.
    if ($asaasPaymentId !== '') {
        $stmt = $pdo->prepare(
            'SELECT * FROM depositos
             WHERE asaas_payment_id = :pid
             LIMIT 1
             FOR UPDATE'
        );
        $stmt->execute([':pid' => $asaasPaymentId]);
        $deposito = $stmt->fetch();
    } else {
        // Fallback: busca por externalReference com lock.
        $stmt = $pdo->prepare(
            'SELECT * FROM depositos
             WHERE external_reference = :ref
             LIMIT 1
             FOR UPDATE'
        );
        $stmt->execute([':ref' => $externalReference]);
        $deposito = $stmt->fetch();
    }

    // Se nao achar deposito local, nao quebra webhook (retorna 200 para nao pausar fila).
    if (!$deposito) {
        $pdo->commit();
        jsonResponse(200, [
            'ok' => true,
            'ignored' => true,
            'reason' => 'Deposito nao encontrado localmente.',
        ]);
    }

    // Se evento nao for PAYMENT_RECEIVED, apenas atualiza status informativo e sai.
    if ($event !== EVENTO_CREDITO) {
        $stmtUp = $pdo->prepare(
            'UPDATE depositos
             SET ultimo_evento = :evt,
                 asaas_event_id = CASE WHEN :event_id <> \'\' THEN :event_id ELSE asaas_event_id END,
                 updated_at = NOW()
             WHERE id = :id'
        );
        $stmtUp->execute([
            ':evt' => $event,
            ':event_id' => $eventId,
            ':id' => (int)$deposito['id'],
        ]);

        $pdo->commit();
        jsonResponse(200, [
            'ok' => true,
            'ignored' => true,
            'reason' => 'Evento sem credito de saldo.',
            'event' => $event,
        ]);
    }

    // IDPOTENCIA 1: se deposito ja esta pago, nao credita novamente.
    if (strtoupper((string)$deposito['status']) === 'PAGO') {
        $pdo->commit();
        jsonResponse(200, [
            'ok' => true,
            'alreadyCredited' => true,
        ]);
    }

    // IDPOTENCIA 2: se mesmo event id ja foi salvo antes, nao processa de novo.
    $eventIdBanco = trim((string)($deposito['asaas_event_id'] ?? ''));
    if ($eventId !== '' && $eventIdBanco !== '' && hash_equals($eventIdBanco, $eventId)) {
        $pdo->commit();
        jsonResponse(200, [
            'ok' => true,
            'alreadyProcessed' => true,
        ]);
    }

    // Le valor do deposito local (fonte de verdade interna).
    $valorCredito = (float)$deposito['valor'];

    // Credita saldo do usuario.
    $stmtSaldo = $pdo->prepare(
        'UPDATE usuarios
         SET saldo = ROUND(saldo + :valor, 2),
             updated_at = NOW()
         WHERE id = :uid
         LIMIT 1'
    );
    $stmtSaldo->execute([
        ':valor' => $valorCredito,
        ':uid' => (int)$deposito['usuario_id'],
    ]);

    // Marca deposito como pago e salva evento processado.
    $stmtDep = $pdo->prepare(
        'UPDATE depositos
         SET status = \'PAGO\',
             pago_em = NOW(),
             ultimo_evento = :evt,
             asaas_event_id = CASE WHEN :event_id <> \'\' THEN :event_id ELSE asaas_event_id END,
             updated_at = NOW()
         WHERE id = :id
         LIMIT 1'
    );
    $stmtDep->execute([
        ':evt' => $event,
        ':event_id' => $eventId,
        ':id' => (int)$deposito['id'],
    ]);

    // Confirma transacao.
    $pdo->commit();

    // Responde sucesso para Asaas.
    jsonResponse(200, [
        'ok' => true,
        'credited' => true,
        'usuario_id' => (int)$deposito['usuario_id'],
        'valor' => $valorCredito,
    ]);
} catch (Throwable $e) {
    // Em caso de erro, desfaz transacao aberta.
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    // Retorna erro 500.
    jsonResponse(500, [
        'ok' => false,
        'error' => 'Falha ao processar webhook do Asaas.',
        'detail' => $e->getMessage(),
    ]);
}
