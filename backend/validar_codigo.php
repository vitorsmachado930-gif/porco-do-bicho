<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if ($method !== 'POST') {
    jsonResponse(405, [
        'ok' => false,
        'error' => 'Método não permitido. Use POST.',
    ]);
}

$tempId = 0;

try {
    if (!whatsappVerificationEnabled()) {
        jsonResponse(200, [
            'ok' => true,
            'message' => 'Validação por WhatsApp está desativada neste ambiente.',
            'whatsapp_verification_required' => false,
        ]);
    }

    try {
        require_once __DIR__ . '/validar_codigo_core.php';
    } catch (Throwable $e) {
        appendAsaasLog('validar_codigo_erro', [
            'erro_include_core' => $e->getMessage(),
        ]);
        jsonResponse(500, [
            'ok' => false,
            'error' => 'Falha interna ao carregar validação de WhatsApp.',
        ]);
    }

    $body = getJsonBody();
    $tempId = (int)($body['cadastro_temp_id'] ?? $body['usuario_id'] ?? 0);
    $codigo = onlyDigits((string)($body['codigo'] ?? ''));

    if ($tempId <= 0) {
        jsonResponse(422, [
            'ok' => false,
            'error' => 'Cadastro pendente inválido para confirmação.',
        ]);
    }

    if (strlen($codigo) !== 6) {
        jsonResponse(422, [
            'ok' => false,
            'error' => 'Código inválido. Informe 6 dígitos.',
        ]);
    }

    $pdo = db();
    ensureWalletSchemaSafely($pdo);

    $user = validarCodigoUsuariosTemp($pdo, $tempId, $codigo);

    appendAsaasLog('validar_codigo_ok', [
        'cadastro_temp_id' => $tempId,
        'usuario_id' => (int)($user['id'] ?? 0),
        'cpf' => (string)($user['cpf_cnpj'] ?? ''),
    ]);

    jsonResponse(200, [
        'ok' => true,
        'message' => 'WhatsApp verificado com sucesso. Cadastro concluído.',
        'usuario' => [
            'id' => (int)($user['id'] ?? 0),
            'nome' => (string)($user['nome'] ?? ''),
            'cpf_cnpj' => (string)($user['cpf_cnpj'] ?? ''),
            'whatsapp' => (string)($user['whatsapp'] ?? ($user['telefone'] ?? '')),
            'whatsapp_verificado' => 1,
            'saldo' => number_format((float)($user['saldo'] ?? 0), 2, '.', ''),
        ],
    ]);
} catch (InvalidArgumentException $e) {
    appendAsaasLog('validar_codigo_erro', [
        'message' => $e->getMessage(),
    ]);
    jsonResponse(422, [
        'ok' => false,
        'error' => $e->getMessage(),
    ]);
} catch (RuntimeException $e) {
    $msg = trim($e->getMessage());
    $status = 422;
    if (str_contains(strtolower($msg), 'já cadastrado')) {
        $status = 409;
    }
    appendAsaasLog('validar_codigo_erro', [
        'message' => $msg,
        'cadastro_temp_id' => $tempId ?? 0,
    ]);
    jsonResponse($status, [
        'ok' => false,
        'error' => $msg,
    ]);
} catch (Throwable $e) {
    appendAsaasLog('validar_codigo_erro', [
        'message' => $e->getMessage(),
        'code' => (string)$e->getCode(),
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Erro interno ao validar código.',
        'debug' => $e->getMessage(),
    ]);
}
