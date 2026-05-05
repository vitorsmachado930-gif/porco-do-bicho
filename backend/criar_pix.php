<?php
// Ativa tipagem estrita.
declare(strict_types=1);

// Carrega configurações e funções auxiliares.
require_once __DIR__ . '/config.php';

// Trata preflight de CORS caso necessário.
if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

// Permite somente POST para criar Pix.
if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    jsonResponse(405, ['ok' => false, 'error' => 'Método não permitido. Use POST.']);
}

try {
    // Lê JSON do corpo.
    $body = getJsonBody();

    // Também aceita application/x-www-form-urlencoded como fallback.
    $usuarioId = (int)($body['usuario_id'] ?? $_POST['usuario_id'] ?? 0);
    $valor = parseMoney($body['valor'] ?? $_POST['valor'] ?? 0);
    $login = trim((string)($body['login'] ?? $_POST['login'] ?? ''));
    $nome = trim((string)($body['nome'] ?? $_POST['nome'] ?? ''));
    $email = trim((string)($body['email'] ?? $_POST['email'] ?? ''));
    $cpfCnpj = normalizeCpf11((string)($body['cpf_cnpj'] ?? $body['cpfCnpj'] ?? $_POST['cpf_cnpj'] ?? $_POST['cpfCnpj'] ?? ''));

    // Valida valor > 0.
    if ($valor <= 0) {
        jsonResponse(422, ['ok' => false, 'error' => 'Informe um valor maior que zero.']);
    }

    // Conecta ao banco e garante estrutura mínima.
    $pdo = db();
    ensureWalletSchema($pdo);

    // Busca usuário por ID, com fallback por login para não depender da carteira /api.
    $usuario = null;
    if ($usuarioId > 0) {
        $usuario = findUserById($pdo, $usuarioId);
        if ($usuario && $cpfCnpj !== '') {
            $upCpf = $pdo->prepare(
                'UPDATE usuarios
                 SET cpf_cnpj = :cpf
                 WHERE id = :id
                 LIMIT 1'
            );
            $upCpf->execute([
                ':cpf' => $cpfCnpj,
                ':id' => $usuarioId,
            ]);
            $usuario = findUserById($pdo, $usuarioId);
        }
    }
    if (!$usuario && $login !== '') {
        $usuario = upsertUserByLogin($pdo, $login, $nome, $email, $cpfCnpj);
        $usuarioId = (int)($usuario['id'] ?? 0);
    }
    if (!$usuario) {
        jsonResponse(404, [
            'ok' => false,
            'error' => 'Usuário não encontrado para depósito.',
            'detail' => 'Informe usuario_id válido ou login do usuário logado.',
        ]);
    }
    if (normalizeCpf11((string)($usuario['cpf_cnpj'] ?? '')) === '') {
        jsonResponse(422, [
            'ok' => false,
            'error' => 'CPF obrigatório para depósito Pix. Cadastre um CPF com 11 dígitos.',
        ]);
    }

    // Cria ou localiza customer no Asaas.
    $customerId = getOrCreateAsaasCustomer($pdo, $usuario);

    // Gera referência externa incluindo o ID do usuário (regra obrigatória).
    $externalReference = sprintf(
        'usuario_%d_dep_%s_%s',
        $usuarioId,
        date('YmdHis'),
        bin2hex(random_bytes(3))
    );

    // 1) Cria depósito PENDENTE antes de gerar o Pix no Asaas.
    $ins = $pdo->prepare(
        'INSERT INTO depositos (
            usuario_id,
            external_reference,
            valor,
            status,
            criado_em,
            atualizado_em
        ) VALUES (
            :usuario_id,
            :external_reference,
            :valor,
            :status,
            NOW(),
            NOW()
        )'
    );

    $ins->execute([
        ':usuario_id' => $usuarioId,
        ':external_reference' => $externalReference,
        ':valor' => $valor,
        ':status' => 'PENDENTE',
    ]);

    $depositoId = (int)$pdo->lastInsertId();

    // 2) Cria cobrança PIX dinâmica no Asaas.
    $dueDate = (new DateTimeImmutable('now'))->modify('+1 day')->format('Y-m-d');

    $respCreate = asaasRequest('POST', '/payments', [
        'customer' => $customerId,
        'billingType' => 'PIX',
        'value' => $valor,
        'dueDate' => $dueDate,
        'description' => 'Depósito de saldo usuário #' . $usuarioId,
        'externalReference' => $externalReference,
    ]);

    if ($respCreate['status'] < 200 || $respCreate['status'] >= 300) {
        // Marca como falha local para rastrear erro.
        $upFail = $pdo->prepare(
            'UPDATE depositos
             SET status = :status, atualizado_em = NOW()
             WHERE id = :id
             LIMIT 1'
        );
        $upFail->execute([
            ':status' => 'FALHOU',
            ':id' => $depositoId,
        ]);

        appendAsaasLog('erro_criar_pix_payment', [
            'usuario_id' => $usuarioId,
            'deposito_id' => $depositoId,
            'status' => $respCreate['status'],
            'body' => $respCreate['body'],
        ]);

        jsonResponse(502, [
            'ok' => false,
            'error' => 'Não foi possível criar cobrança Pix no Asaas.',
            'provider' => $respCreate['body'],
        ]);
    }

    $paymentId = trim((string)($respCreate['body']['id'] ?? ''));
    if ($paymentId === '') {
        throw new RuntimeException('Asaas não retornou payment id da cobrança Pix.');
    }

    // 3) Busca QR Code e payload copia e cola.
    $respQr = asaasRequest('GET', '/payments/' . rawurlencode($paymentId) . '/pixQrCode');

    if ($respQr['status'] < 200 || $respQr['status'] >= 300) {
        $upFail = $pdo->prepare(
            'UPDATE depositos
             SET asaas_payment_id = :pay, status = :status, atualizado_em = NOW()
             WHERE id = :id
             LIMIT 1'
        );
        $upFail->execute([
            ':pay' => $paymentId,
            ':status' => 'FALHOU',
            ':id' => $depositoId,
        ]);

        appendAsaasLog('erro_buscar_qr_pix', [
            'usuario_id' => $usuarioId,
            'deposito_id' => $depositoId,
            'asaas_payment_id' => $paymentId,
            'status' => $respQr['status'],
            'body' => $respQr['body'],
        ]);

        jsonResponse(502, [
            'ok' => false,
            'error' => 'Pix criado, mas falhou ao buscar QR Code.',
            'provider' => $respQr['body'],
        ]);
    }

    $qrBase64 = trim((string)($respQr['body']['encodedImage'] ?? ''));
    $payloadPix = trim((string)($respQr['body']['payload'] ?? ''));

    // 4) Atualiza depósito pendente com dados do Pix.
    $upOk = $pdo->prepare(
        'UPDATE depositos
         SET asaas_payment_id = :pay,
             payload_pix = :payload,
             qr_code_base64 = :qr,
             atualizado_em = NOW()
         WHERE id = :id
         LIMIT 1'
    );

    $upOk->execute([
        ':pay' => $paymentId,
        ':payload' => $payloadPix,
        ':qr' => $qrBase64,
        ':id' => $depositoId,
    ]);

    // 5) Retorna para frontend.
    jsonResponse(201, [
        'ok' => true,
        'payment_id' => $paymentId,
        'asaas_payment_id' => $paymentId,
        'valor' => $valor,
        'payload_pix' => $payloadPix,
        'qr_code_base64' => $qrBase64,
        'external_reference' => $externalReference,
        'deposito_id' => $depositoId,
        'status' => 'PENDENTE',
    ]);
} catch (Throwable $e) {
    appendAsaasLog('erro_interno_criar_pix', [
        'message' => $e->getMessage(),
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Erro interno ao criar Pix.',
        'detail' => $e->getMessage(),
    ]);
}
