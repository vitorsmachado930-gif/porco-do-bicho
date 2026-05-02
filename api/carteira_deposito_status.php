<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_common.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_db.php';

walletTratarPreflight();
walletValidarMetodo('GET');
walletValidarClienteWeb();
walletAplicarRateLimit('carteira-deposito-status', 120, 60);

try {
    walletValidarConfiguracaoMinima(false);
    $pdo = walletPdo();

    $ref = trim((string)($_GET['ref'] ?? ''));
    if ($ref === '') {
        walletResponder(422, ['ok' => false, 'error' => 'Referencia obrigatoria.']);
    }

    $stmt = $pdo->prepare(
        'SELECT d.id, d.reference_id, d.provider_payment_id, d.valor, d.status, d.created_at, d.expires_at, d.paid_at,
                u.id AS usuario_id, u.login, u.saldo
         FROM depositos d
         INNER JOIN usuarios u ON u.id = d.usuario_id
         WHERE d.reference_id = :ref
         LIMIT 1'
    );
    $stmt->execute([':ref' => $ref]);
    $dep = $stmt->fetch();

    if (!$dep) {
        walletResponder(404, ['ok' => false, 'error' => 'Deposito nao encontrado.']);
    }

    walletResponder(200, [
        'ok' => true,
        'deposito' => [
            'id' => (int)$dep['id'],
            'referenceId' => (string)$dep['reference_id'],
            'providerPaymentId' => (string)($dep['provider_payment_id'] ?? ''),
            'valor' => (float)$dep['valor'],
            'status' => (string)$dep['status'],
            'createdAt' => (string)$dep['created_at'],
            'expiresAt' => (string)($dep['expires_at'] ?? ''),
            'paidAt' => (string)($dep['paid_at'] ?? ''),
        ],
        'usuario' => [
            'id' => (int)$dep['usuario_id'],
            'login' => (string)$dep['login'],
            'saldo' => (float)$dep['saldo'],
        ],
    ]);
} catch (Throwable $e) {
    walletResponder(500, [
        'ok' => false,
        'error' => 'Falha ao consultar deposito.',
    ]);
}
