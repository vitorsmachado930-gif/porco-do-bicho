<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_common.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_db.php';

walletTratarPreflight();
walletValidarMetodo('POST');
walletAplicarRateLimit('carteira-webhook-asaas', 600, 60);

try {
    walletValidarConfiguracaoMinima(false);
    $cfg = walletConfig();

    $tokenEsperado = trim((string)$cfg['asaas_webhook_token']);
    if ($tokenEsperado === '') {
        walletResponder(500, ['ok' => false, 'error' => 'Webhook token nao configurado.']);
    }

    $tokenRecebido = walletAsaasResolveHeader('asaas-access-token');
    if (!hash_equals($tokenEsperado, $tokenRecebido)) {
        walletResponder(401, ['ok' => false, 'error' => 'Token do webhook invalido.']);
    }

    $body = walletBodyJson(2 * 1024 * 1024);
    $eventId = trim((string)($body['id'] ?? ''));
    $eventType = strtoupper(trim((string)($body['event'] ?? '')));
    $payment = isset($body['payment']) && is_array($body['payment']) ? $body['payment'] : [];
    $paymentId = trim((string)($payment['id'] ?? ''));
    $externalReference = trim((string)($payment['externalReference'] ?? ''));

    if ($paymentId === '' && $externalReference === '') {
        walletResponder(422, ['ok' => false, 'error' => 'Webhook sem identificador de pagamento.']);
    }

    // So credita quando o pagamento foi efetivamente recebido.
    if ($eventType !== 'PAYMENT_RECEIVED') {
        walletResponder(200, [
            'ok' => true,
            'ignored' => true,
            'reason' => 'Evento sem credito de saldo.',
            'event' => $eventType,
        ]);
    }

    $pdo = walletPdo();
    $pdo->beginTransaction();

    if ($paymentId !== '') {
        $stmt = $pdo->prepare(
            'SELECT d.id, d.usuario_id, d.valor, d.status, d.provider_event_id
             FROM depositos d
             WHERE d.provider_payment_id = :paymentId
             LIMIT 1
             FOR UPDATE'
        );
        $stmt->execute([':paymentId' => $paymentId]);
        $dep = $stmt->fetch();
    } else {
        $stmt = $pdo->prepare(
            'SELECT d.id, d.usuario_id, d.valor, d.status, d.provider_event_id
             FROM depositos d
             WHERE d.reference_id = :ref
             LIMIT 1
             FOR UPDATE'
        );
        $stmt->execute([':ref' => $externalReference]);
        $dep = $stmt->fetch();
    }

    if (!$dep) {
        $pdo->commit();
        walletResponder(200, [
            'ok' => true,
            'ignored' => true,
            'reason' => 'Deposito nao encontrado para este webhook.',
        ]);
    }

    if ($eventId !== '' && $dep['provider_event_id'] !== null && (string)$dep['provider_event_id'] === $eventId) {
        $pdo->commit();
        walletResponder(200, [
            'ok' => true,
            'alreadyProcessed' => true,
        ]);
    }

    if (strtoupper((string)$dep['status']) === 'PAGO') {
        $pdo->commit();
        walletResponder(200, [
            'ok' => true,
            'alreadyCredited' => true,
        ]);
    }

    $valorCredito = (float)$dep['valor'];

    $stmtSaldo = $pdo->prepare('UPDATE usuarios SET saldo = ROUND(saldo + :valor, 2) WHERE id = :usuarioId LIMIT 1');
    $stmtSaldo->execute([
        ':valor' => $valorCredito,
        ':usuarioId' => (int)$dep['usuario_id'],
    ]);

    $stmtDep = $pdo->prepare(
        'UPDATE depositos
         SET status = \'PAGO\',
             paid_at = NOW(),
             provider_event_id = :eventId,
             updated_at = NOW()
         WHERE id = :id
         LIMIT 1'
    );
    $stmtDep->execute([
        ':eventId' => $eventId !== '' ? $eventId : null,
        ':id' => (int)$dep['id'],
    ]);

    $pdo->commit();

    walletResponder(200, [
        'ok' => true,
        'credited' => true,
        'valor' => $valorCredito,
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    walletResponder(500, [
        'ok' => false,
        'error' => 'Falha ao processar webhook.',
    ]);
}
