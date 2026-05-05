<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_common.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_db.php';

walletTratarPreflight();
walletValidarMetodo('POST');
walletValidarClienteWeb();
walletAplicarRateLimit('carteira-deposito-criar', 25, 60);

try {
    walletValidarConfiguracaoMinima(true);
    $pdo = walletPdo();

    $payload = walletBodyJson();
    $login = walletNormalizarLogin($payload['login'] ?? '');
    $senha = walletValidarSenhaTexto($payload['senha'] ?? '');
    $valor = walletNormalizarValor($payload['valor'] ?? 0);
    $cpfCnpj = walletNormalizarCpfCnpj(isset($payload['cpfCnpj']) ? (string)$payload['cpfCnpj'] : '');

    if ($login === '') {
        walletResponder(422, ['ok' => false, 'error' => 'Login obrigatorio.']);
    }
    if ($senha === '') {
        walletResponder(422, ['ok' => false, 'error' => 'Senha obrigatoria.']);
    }
    if ($valor < 1.00) {
        walletResponder(422, ['ok' => false, 'error' => 'Valor minimo para deposito: R$ 1,00.']);
    }

    $pdo->beginTransaction();

    $stmtUser = $pdo->prepare(
        'SELECT id, nome, login, senha_hash, email, telefone, cpf_cnpj, asaas_customer_id, saldo, status
         FROM usuarios
         WHERE login = :login
         LIMIT 1
         FOR UPDATE'
    );
    $stmtUser->execute([':login' => $login]);
    $usuario = $stmtUser->fetch();

    if (!$usuario) {
        $pdo->rollBack();
        walletResponder(404, ['ok' => false, 'error' => 'Usuario nao encontrado na carteira.']);
    }
    if (!walletSenhaConfere($senha, $usuario['senha_hash'] ?? '')) {
        $pdo->rollBack();
        walletResponder(403, ['ok' => false, 'error' => 'Credenciais invalidas.']);
    }

    if (strtoupper((string)$usuario['status']) !== 'ATIVO') {
        $pdo->rollBack();
        walletResponder(403, ['ok' => false, 'error' => 'Usuario bloqueado para deposito.']);
    }

    $cpfEfetivo = walletNormalizarCpfCnpj((string)($usuario['cpf_cnpj'] ?? ''));
    if ($cpfEfetivo === '' && $cpfCnpj !== '') {
        $cpfEfetivo = $cpfCnpj;
    }

    $asaasCustomerId = trim((string)($usuario['asaas_customer_id'] ?? ''));

    if ($asaasCustomerId === '') {
        if ($cpfEfetivo === '') {
            $pdo->rollBack();
            walletResponder(422, [
                'ok' => false,
                'error' => 'CPF/CNPJ obrigatorio para primeiro deposito. Envie no campo cpfCnpj.'
            ]);
        }

        $refCliente = 'usr_' . (string)$usuario['id'];

        $consultaCliente = walletAsaasRequest('GET', '/customers', null, [
            'externalReference' => $refCliente,
            'limit' => 1,
            'offset' => 0,
        ]);

        if (($consultaCliente['status'] ?? 0) >= 200 && ($consultaCliente['status'] ?? 0) < 300) {
            $lista = $consultaCliente['body']['data'] ?? [];
            if (is_array($lista) && isset($lista[0]['id'])) {
                $asaasCustomerId = (string)$lista[0]['id'];
            }
        }

        if ($asaasCustomerId === '') {
            $criarCliente = walletAsaasRequest('POST', '/customers', [
                'name' => (string)$usuario['nome'],
                'cpfCnpj' => $cpfEfetivo,
                'email' => (string)($usuario['email'] ?? ''),
                'phone' => walletDigitos((string)($usuario['telefone'] ?? '')),
                'externalReference' => $refCliente,
                'notificationDisabled' => true,
            ]);

            if (($criarCliente['status'] ?? 0) < 200 || ($criarCliente['status'] ?? 0) >= 300) {
                $pdo->rollBack();
                walletResponder(502, [
                    'ok' => false,
                    'error' => 'Falha ao criar cliente no Asaas.',
                    'provider' => $criarCliente['body'] ?? null,
                ]);
            }

            $asaasCustomerId = (string)($criarCliente['body']['id'] ?? '');
            if ($asaasCustomerId === '') {
                $pdo->rollBack();
                walletResponder(502, ['ok' => false, 'error' => 'Asaas nao retornou customer id.']);
            }
        }

        $stmtUpdCustomer = $pdo->prepare(
            'UPDATE usuarios
             SET asaas_customer_id = :customerId,
                 cpf_cnpj = CASE WHEN cpf_cnpj IS NULL OR cpf_cnpj = \'\' THEN :cpf ELSE cpf_cnpj END
             WHERE id = :id'
        );
        $stmtUpdCustomer->execute([
            ':customerId' => $asaasCustomerId,
            ':cpf' => $cpfEfetivo,
            ':id' => (int)$usuario['id'],
        ]);
    }

    $cfg = walletConfig();
    $dueDate = (new DateTimeImmutable('now', new DateTimeZone('America/Sao_Paulo')))
        ->modify('+' . (int)$cfg['pix_due_days'] . ' day')
        ->format('Y-m-d');

    $referenceId = sprintf(
        'dep_%d_%s_%s',
        (int)$usuario['id'],
        date('YmdHis'),
        bin2hex(random_bytes(4))
    );

    $criarCobranca = walletAsaasRequest('POST', '/payments', [
        'customer' => $asaasCustomerId,
        'billingType' => 'PIX',
        'value' => $valor,
        'dueDate' => $dueDate,
        'description' => 'Deposito de saldo @' . (string)$usuario['login'],
        'externalReference' => $referenceId,
    ]);

    if (($criarCobranca['status'] ?? 0) < 200 || ($criarCobranca['status'] ?? 0) >= 300) {
        $pdo->rollBack();
        walletResponder(502, [
            'ok' => false,
            'error' => 'Falha ao criar cobranca PIX no Asaas.',
            'provider' => $criarCobranca['body'] ?? null,
        ]);
    }

    $paymentId = (string)($criarCobranca['body']['id'] ?? '');
    if ($paymentId === '') {
        $pdo->rollBack();
        walletResponder(502, ['ok' => false, 'error' => 'Asaas nao retornou payment id.']);
    }

    $qrResp = walletAsaasRequest('GET', '/payments/' . rawurlencode($paymentId) . '/pixQrCode');
    if (($qrResp['status'] ?? 0) < 200 || ($qrResp['status'] ?? 0) >= 300) {
        $pdo->rollBack();
        walletResponder(502, [
            'ok' => false,
            'error' => 'Falha ao obter QR Code PIX.',
            'provider' => $qrResp['body'] ?? null,
        ]);
    }

    $encodedImage = (string)($qrResp['body']['encodedImage'] ?? '');
    $payloadPix = (string)($qrResp['body']['payload'] ?? '');
    $expirationDate = (string)($qrResp['body']['expirationDate'] ?? '');
    $expiresAt = null;
    if ($expirationDate !== '') {
        $dtExp = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $expirationDate, new DateTimeZone('America/Sao_Paulo'));
        if ($dtExp instanceof DateTimeImmutable) {
            $expiresAt = $dtExp->format('Y-m-d H:i:s');
        }
    }

    $stmtInsert = $pdo->prepare(
        'INSERT INTO depositos (
            usuario_id,
            reference_id,
            provider,
            provider_payment_id,
            valor,
            status,
            qr_code_base64,
            pix_copia_cola,
            expires_at
         ) VALUES (
            :usuarioId,
            :referenceId,
            \'ASAAS\',
            :paymentId,
            :valor,
            \'PENDENTE\',
            :qr,
            :pix,
            :expiresAt
         )'
    );

    $stmtInsert->execute([
        ':usuarioId' => (int)$usuario['id'],
        ':referenceId' => $referenceId,
        ':paymentId' => $paymentId,
        ':valor' => $valor,
        ':qr' => $encodedImage,
        ':pix' => $payloadPix,
        ':expiresAt' => $expiresAt,
    ]);

    $depositoId = (int)$pdo->lastInsertId();

    $pdo->commit();

    walletResponder(201, [
        'ok' => true,
        'deposito' => [
            'id' => $depositoId,
            'referenceId' => $referenceId,
            'status' => 'PENDENTE',
            'valor' => $valor,
            'provider' => 'ASAAS',
            'providerPaymentId' => $paymentId,
            'pixCopiaCola' => $payloadPix,
            'qrCodeBase64' => $encodedImage,
            'expiresAt' => $expiresAt,
        ],
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    walletResponder(500, [
        'ok' => false,
        'error' => 'Falha interna ao criar deposito pendente.',
    ]);
}
