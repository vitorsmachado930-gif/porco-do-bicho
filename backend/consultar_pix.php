<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    jsonResponse(405, ['ok' => false, 'error' => 'Método não permitido. Use POST.']);
}

function asaasStatusIndicaPagamento(string $status): bool
{
    $s = strtoupper(trim($status));
    return in_array($s, ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'], true);
}

try {
    $body = getJsonBody();

    $depositoId = (int)($body['deposito_id'] ?? 0);
    $paymentId = trim((string)($body['payment_id'] ?? ''));
    $usuarioId = (int)($body['usuario_id'] ?? 0);
    $cpf = normalizeCpf11((string)($body['cpf'] ?? ''));

    if ($depositoId <= 0 && $paymentId === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'Informe deposito_id ou payment_id.']);
    }

    $pdo = db();
    ensureWalletSchemaSafely($pdo);

    if ($depositoId > 0) {
        $stmt = $pdo->prepare('SELECT * FROM depositos WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $depositoId]);
    } else {
        $stmt = $pdo->prepare('SELECT * FROM depositos WHERE asaas_payment_id = :pid LIMIT 1');
        $stmt->execute([':pid' => $paymentId]);
    }
    $deposito = $stmt->fetch();

    if (!$deposito) {
        jsonResponse(404, ['ok' => false, 'error' => 'Depósito não encontrado.']);
    }

    $depositoId = (int)$deposito['id'];
    $paymentId = trim((string)($deposito['asaas_payment_id'] ?? $paymentId));
    $usuarioDepositoId = (int)($deposito['usuario_id'] ?? 0);
    $statusAtual = strtoupper(trim((string)($deposito['status'] ?? 'PENDENTE')));
    $valorDeposito = (float)($deposito['valor'] ?? 0);

    if ($usuarioId > 0 && $usuarioDepositoId !== $usuarioId) {
        jsonResponse(403, ['ok' => false, 'error' => 'Depósito não pertence ao usuário informado.']);
    }

    if ($cpf !== '') {
        $stmtCpf = $pdo->prepare('SELECT id FROM usuarios WHERE id = :id AND cpf_cnpj = :cpf LIMIT 1');
        $stmtCpf->execute([
            ':id' => $usuarioDepositoId,
            ':cpf' => $cpf,
        ]);
        if (!$stmtCpf->fetch()) {
            jsonResponse(403, ['ok' => false, 'error' => 'Usuário inválido para este depósito.']);
        }
    }

    // Se já está pago no banco, só retorna saldo atual.
    if ($statusAtual === 'PAGO') {
        $stmtSaldo = $pdo->prepare('SELECT saldo FROM usuarios WHERE id = :id LIMIT 1');
        $stmtSaldo->execute([':id' => $usuarioDepositoId]);
        $saldo = (float)($stmtSaldo->fetchColumn() ?: 0);

        jsonResponse(200, [
            'ok' => true,
            'pago' => true,
            'status' => 'PAGO',
            'asaas_status' => 'RECEIVED',
            'deposito_id' => $depositoId,
            'payment_id' => $paymentId,
            'valor' => (float)number_format($valorDeposito, 2, '.', ''),
            'saldo' => (float)number_format($saldo, 2, '.', ''),
        ]);
    }

    if ($paymentId === '') {
        jsonResponse(200, [
            'ok' => true,
            'pago' => false,
            'status' => $statusAtual ?: 'PENDENTE',
            'asaas_status' => '',
            'deposito_id' => $depositoId,
            'payment_id' => '',
        ]);
    }

    // Consulta status no Asaas.
    $resp = asaasRequest('GET', '/payments/' . rawurlencode($paymentId));
    if ($resp['status'] < 200 || $resp['status'] >= 300 || !is_array($resp['body'])) {
        appendAsaasLog('consultar_pix_erro_provider', [
            'deposito_id' => $depositoId,
            'payment_id' => $paymentId,
            'status_http' => $resp['status'],
            'body' => $resp['body'] ?? null,
        ]);
        jsonResponse(200, [
            'ok' => true,
            'pago' => false,
            'status' => $statusAtual ?: 'PENDENTE',
            'asaas_status' => '',
            'deposito_id' => $depositoId,
            'payment_id' => $paymentId,
        ]);
    }

    $asaasStatus = strtoupper(trim((string)($resp['body']['status'] ?? '')));
    $pagoNoAsaas = asaasStatusIndicaPagamento($asaasStatus);

    if (!$pagoNoAsaas) {
        jsonResponse(200, [
            'ok' => true,
            'pago' => false,
            'status' => $statusAtual ?: 'PENDENTE',
            'asaas_status' => $asaasStatus,
            'deposito_id' => $depositoId,
            'payment_id' => $paymentId,
        ]);
    }

    // Reconcilia pagamento localmente (idempotente, com lock).
    $pdo->beginTransaction();

    $stmtLock = $pdo->prepare('SELECT * FROM depositos WHERE id = :id LIMIT 1 FOR UPDATE');
    $stmtLock->execute([':id' => $depositoId]);
    $depLocked = $stmtLock->fetch();
    if (!$depLocked) {
        $pdo->rollBack();
        jsonResponse(404, ['ok' => false, 'error' => 'Depósito não encontrado para conciliação.']);
    }

    $statusLocked = strtoupper(trim((string)($depLocked['status'] ?? 'PENDENTE')));
    $valorLocked = (float)($depLocked['valor'] ?? 0);
    $usuarioLocked = (int)($depLocked['usuario_id'] ?? 0);

    if ($statusLocked !== 'PAGO') {
        $upUser = $pdo->prepare(
            'UPDATE usuarios SET saldo = ROUND(saldo + :valor, 2) WHERE id = :uid LIMIT 1'
        );
        $upUser->execute([
            ':valor' => $valorLocked,
            ':uid' => $usuarioLocked,
        ]);

        $upDep = $pdo->prepare(
            'UPDATE depositos
             SET status = :status,
                 pago_em = NOW(),
                 atualizado_em = NOW(),
                 asaas_payment_id = CASE WHEN asaas_payment_id IS NULL OR asaas_payment_id = "" THEN :pid ELSE asaas_payment_id END
             WHERE id = :id
             LIMIT 1'
        );
        $upDep->execute([
            ':status' => 'PAGO',
            ':pid' => $paymentId,
            ':id' => $depositoId,
        ]);
    }

    $stmtSaldoFinal = $pdo->prepare('SELECT saldo FROM usuarios WHERE id = :id LIMIT 1');
    $stmtSaldoFinal->execute([':id' => $usuarioLocked]);
    $saldoFinal = (float)($stmtSaldoFinal->fetchColumn() ?: 0);

    $pdo->commit();

    appendAsaasLog('consultar_pix_credito_ok', [
        'deposito_id' => $depositoId,
        'usuario_id' => $usuarioLocked,
        'payment_id' => $paymentId,
        'asaas_status' => $asaasStatus,
        'valor' => $valorLocked,
    ]);

    jsonResponse(200, [
        'ok' => true,
        'pago' => true,
        'status' => 'PAGO',
        'asaas_status' => $asaasStatus,
        'deposito_id' => $depositoId,
        'payment_id' => $paymentId,
        'valor' => (float)number_format($valorLocked, 2, '.', ''),
        'saldo' => (float)number_format($saldoFinal, 2, '.', ''),
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    appendAsaasLog('consultar_pix_erro', [
        'message' => $e->getMessage(),
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Falha ao consultar pagamento Pix.',
    ]);
}

