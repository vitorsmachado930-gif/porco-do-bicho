<?php
// Ativa tipagem estrita.
declare(strict_types=1);

// Carrega configurações e helpers.
require_once __DIR__ . '/config.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

// Requisito solicitado: ao abrir no navegador, retornar mensagem simples.
if ($method === 'GET') {
    textResponse(200, 'WEBHOOK ASAAS OK');
}

// Permite somente POST para eventos do Asaas.
if ($method !== 'POST') {
    textResponse(405, 'METHOD NOT ALLOWED');
}

try {
    // Lê corpo bruto para logar exatamente o que chegou.
    $rawBody = file_get_contents('php://input');
    if (!is_string($rawBody)) {
        $rawBody = '';
    }

    // Loga chegada do webhook para facilitar depuração.
    appendAsaasLog('webhook_recebido', [
        'ip' => (string)($_SERVER['REMOTE_ADDR'] ?? ''),
        'method' => $method,
        'raw' => $rawBody,
    ]);

    // Valida token (opcional): só valida se token foi configurado.
    $configuredToken = envOrDefault('ASAAS_WEBHOOK_TOKEN', ASAAS_WEBHOOK_TOKEN);
    if ($configuredToken !== '' && !str_starts_with($configuredToken, 'SEU_TOKEN_')) {
        $receivedToken = getHeaderValue('asaas-access-token');
        if ($receivedToken === '' || !hash_equals($configuredToken, $receivedToken)) {
            appendAsaasLog('webhook_token_invalido', [
                'recebido' => $receivedToken,
            ]);
            textResponse(401, 'TOKEN INVALID');
        }
    }

    // Decodifica JSON.
    $eventData = json_decode($rawBody, true);
    if (!is_array($eventData)) {
        appendAsaasLog('webhook_json_invalido', []);
        // Retorna 200 para não pausar fila no Asaas por payload ruim.
        textResponse(200, 'OK');
    }

    $eventName = strtoupper(trim((string)($eventData['event'] ?? '')));
    $eventId = trim((string)($eventData['id'] ?? ''));

    $payment = isset($eventData['payment']) && is_array($eventData['payment'])
        ? $eventData['payment']
        : [];

    $paymentId = trim((string)($payment['id'] ?? ''));
    $externalReference = trim((string)($payment['externalReference'] ?? ''));

    // Mantém log resumido do evento.
    appendAsaasLog('webhook_evento', [
        'event' => $eventName,
        'event_id' => $eventId,
        'payment_id' => $paymentId,
        'external_reference' => $externalReference,
    ]);

    // Só credita saldo no evento PAYMENT_RECEIVED.
    if ($eventName !== 'PAYMENT_RECEIVED') {
        textResponse(200, 'OK');
    }

    // Sem payment.id não tem como identificar depósito.
    if ($paymentId === '') {
        appendAsaasLog('webhook_sem_payment_id', [
            'event' => $eventName,
        ]);
        textResponse(200, 'OK');
    }

    $pdo = db();
    ensureWalletSchema($pdo);

    $pdo->beginTransaction();

    // Tenta localizar depósito por asaas_payment_id com lock.
    $stmt = $pdo->prepare(
        'SELECT * FROM depositos
         WHERE asaas_payment_id = :pid
         LIMIT 1
         FOR UPDATE'
    );
    $stmt->execute([':pid' => $paymentId]);
    $deposito = $stmt->fetch();

    // Fallback por external_reference caso payment_id ainda não tenha sido salvo.
    if (!$deposito && $externalReference !== '') {
        $stmt2 = $pdo->prepare(
            'SELECT * FROM depositos
             WHERE external_reference = :ref
             LIMIT 1
             FOR UPDATE'
        );
        $stmt2->execute([':ref' => $externalReference]);
        $deposito = $stmt2->fetch();
    }

    // Se não encontrou depósito local, não quebra fila do Asaas.
    if (!$deposito) {
        $pdo->commit();
        appendAsaasLog('webhook_deposito_nao_encontrado', [
            'payment_id' => $paymentId,
            'external_reference' => $externalReference,
        ]);
        textResponse(200, 'OK');
    }

    $depositoId = (int)$deposito['id'];
    $usuarioId = (int)$deposito['usuario_id'];
    $valor = (float)$deposito['valor'];
    $statusAtual = strtoupper(trim((string)$deposito['status']));

    // Impede crédito duplicado: se já está PAGO, não credita novamente.
    if ($statusAtual === 'PAGO') {
        $pdo->commit();
        appendAsaasLog('webhook_duplicado_ignorado', [
            'deposito_id' => $depositoId,
            'payment_id' => $paymentId,
        ]);
        textResponse(200, 'OK');
    }

    // Impede duplicidade também por event_id já processado (quando disponível).
    $eventIdBanco = trim((string)($deposito['asaas_event_id'] ?? ''));
    if ($eventId !== '' && $eventIdBanco !== '' && hash_equals($eventIdBanco, $eventId)) {
        $pdo->commit();
        appendAsaasLog('webhook_evento_repetido', [
            'deposito_id' => $depositoId,
            'event_id' => $eventId,
        ]);
        textResponse(200, 'OK');
    }

    // Atualiza saldo do usuário.
    $upUser = $pdo->prepare(
        'UPDATE usuarios
         SET saldo = ROUND(saldo + :valor, 2)
         WHERE id = :uid
         LIMIT 1'
    );
    $upUser->execute([
        ':valor' => $valor,
        ':uid' => $usuarioId,
    ]);

    // Marca depósito como pago e registra dados do evento.
    $upDep = $pdo->prepare(
        'UPDATE depositos
         SET status = :status,
             pago_em = NOW(),
             asaas_event_id = CASE WHEN :event_id <> "" THEN :event_id ELSE asaas_event_id END,
             atualizado_em = NOW(),
             asaas_payment_id = CASE WHEN asaas_payment_id IS NULL OR asaas_payment_id = "" THEN :payment_id ELSE asaas_payment_id END
         WHERE id = :id
         LIMIT 1'
    );

    $upDep->execute([
        ':status' => 'PAGO',
        ':event_id' => $eventId,
        ':payment_id' => $paymentId,
        ':id' => $depositoId,
    ]);

    $pdo->commit();

    appendAsaasLog('webhook_credito_ok', [
        'deposito_id' => $depositoId,
        'usuario_id' => $usuarioId,
        'valor' => $valor,
        'payment_id' => $paymentId,
    ]);

    textResponse(200, 'OK');
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    appendAsaasLog('webhook_erro_interno', [
        'message' => $e->getMessage(),
    ]);

    // Mesmo em erro, retornamos 200 para evitar pausa automática da fila do Asaas.
    textResponse(200, 'OK');
}
