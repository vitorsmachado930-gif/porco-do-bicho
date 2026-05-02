<?php
// Ativa tipagem estrita.
declare(strict_types=1);

// Carrega configuracao e utilitarios.
require_once __DIR__ . '/config.php';

// Trata preflight OPTIONS.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    // Metodos permitidos.
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    // Headers permitidos.
    header('Access-Control-Allow-Headers: Content-Type');
    // Sem conteudo.
    http_response_code(204);
    // Encerra.
    exit;
}

// Aceita apenas POST.
if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    jsonResponse(405, ['ok' => false, 'error' => 'Metodo nao permitido. Use POST.']);
}

try {
    // Le payload JSON.
    $body = getJsonBody();

    // Extrai dados principais.
    $userId = (int)($body['user_id'] ?? 0);
    $amount = normalizeAmount($body['valor'] ?? 0);

    // Valida usuario.
    if ($userId <= 0) {
        jsonResponse(422, ['ok' => false, 'error' => 'user_id invalido.']);
    }

    // Valida valor minimo.
    if ($amount < 1.00) {
        jsonResponse(422, ['ok' => false, 'error' => 'Valor minimo: R$ 1,00.']);
    }

    // Conecta no banco.
    $pdo = db();

    // Inicia transacao para manter consistencia.
    $pdo->beginTransaction();

    // Busca usuario com lock para evitar corrida.
    $stmtUser = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1 FOR UPDATE');
    $stmtUser->execute([':id' => $userId]);
    $user = $stmtUser->fetch();

    // Valida existencia.
    if (!$user) {
        $pdo->rollBack();
        jsonResponse(404, ['ok' => false, 'error' => 'Usuario nao encontrado.']);
    }

    // Bloqueia se usuario estiver inativo.
    if (strtoupper((string)($user['status'] ?? 'ATIVO')) !== 'ATIVO') {
        $pdo->rollBack();
        jsonResponse(403, ['ok' => false, 'error' => 'Usuario bloqueado para deposito.']);
    }

    // Busca ou cria customer Asaas.
    $customerId = getOrCreateAsaasCustomer($pdo, $userId);

    // Define vencimento da cobranca (1 dia).
    $dueDate = (new DateTimeImmutable('now'))->modify('+1 day')->format('Y-m-d');

    // Gera referencia externa unica com id do usuario (regra solicitada).
    $externalReference = sprintf(
        'usuario_%d_dep_%s_%s',
        $userId,
        date('YmdHis'),
        bin2hex(random_bytes(4))
    );

    // Cria cobranca PIX no endpoint oficial Asaas.
    $chargeResp = asaasRequest('POST', '/payments', [
        'customer' => $customerId,
        'billingType' => 'PIX',
        'value' => $amount,
        'dueDate' => $dueDate,
        'description' => 'Deposito de saldo usuario #' . $userId,
        'externalReference' => $externalReference,
    ]);

    // Verifica sucesso na criacao da cobranca.
    if ($chargeResp['status'] < 200 || $chargeResp['status'] >= 300) {
        $pdo->rollBack();
        jsonResponse(502, [
            'ok' => false,
            'error' => 'Falha ao criar cobranca PIX no Asaas.',
            'provider' => $chargeResp['body'],
        ]);
    }

    // Extrai id da cobranca.
    $paymentId = (string)($chargeResp['body']['id'] ?? '');

    // Garante id valido.
    if ($paymentId === '') {
        $pdo->rollBack();
        jsonResponse(502, ['ok' => false, 'error' => 'Asaas nao retornou payment id.']);
    }

    // Busca QR code e payload copia e cola.
    $qrResp = asaasRequest('GET', '/payments/' . rawurlencode($paymentId) . '/pixQrCode');

    // Valida retorno do QR code.
    if ($qrResp['status'] < 200 || $qrResp['status'] >= 300) {
        $pdo->rollBack();
        jsonResponse(502, [
            'ok' => false,
            'error' => 'Falha ao obter QR code PIX no Asaas.',
            'provider' => $qrResp['body'],
        ]);
    }

    // Extrai imagem base64 do QR.
    $encodedImage = (string)($qrResp['body']['encodedImage'] ?? '');

    // Extrai payload copia e cola.
    $pixPayload = (string)($qrResp['body']['payload'] ?? '');

    // Extrai data de expiracao (se vier do Asaas).
    $expiresAtRaw = (string)($qrResp['body']['expirationDate'] ?? '');

    // Converte expiracao para formato SQL quando possivel.
    $expiresAtSql = null;
    if ($expiresAtRaw !== '') {
        $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $expiresAtRaw);
        if ($dt instanceof DateTimeImmutable) {
            $expiresAtSql = $dt->format('Y-m-d H:i:s');
        }
    }

    // Salva deposito como pendente (ainda sem credito no saldo).
    $stmtDep = $pdo->prepare(
        'INSERT INTO depositos (
            usuario_id,
            external_reference,
            asaas_payment_id,
            valor,
            status,
            qr_code_base64,
            pix_copia_cola,
            expires_at,
            created_at,
            updated_at
        ) VALUES (
            :usuario_id,
            :external_reference,
            :asaas_payment_id,
            :valor,
            :status,
            :qr,
            :pix,
            :expires_at,
            NOW(),
            NOW()
        )'
    );

    // Executa insert de deposito.
    $stmtDep->execute([
        ':usuario_id' => $userId,
        ':external_reference' => $externalReference,
        ':asaas_payment_id' => $paymentId,
        ':valor' => $amount,
        ':status' => 'PENDENTE',
        ':qr' => $encodedImage,
        ':pix' => $pixPayload,
        ':expires_at' => $expiresAtSql,
    ]);

    // Recupera id local do deposito.
    $depositoId = (int)$pdo->lastInsertId();

    // Confirma transacao.
    $pdo->commit();

    // Retorna dados para frontend exibir QR.
    jsonResponse(201, [
        'ok' => true,
        'deposito' => [
            'id' => $depositoId,
            'user_id' => $userId,
            'valor' => $amount,
            'status' => 'PENDENTE',
            'externalReference' => $externalReference,
            'asaasPaymentId' => $paymentId,
            'pixCopiaCola' => $pixPayload,
            'qrCodeBase64' => $encodedImage,
            'expiresAt' => $expiresAtSql,
        ],
    ]);
} catch (Throwable $e) {
    // Se houver transacao aberta, desfaz.
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    // Retorna erro.
    jsonResponse(500, [
        'ok' => false,
        'error' => 'Erro interno ao criar PIX.',
        'detail' => $e->getMessage(),
    ]);
}
