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
    jsonResponse(405, ['ok' => false, 'error' => 'Método não permitido. Use POST.']);
}

try {
    $body = getJsonBody();

    $login = normalizeLogin((string)($body['login'] ?? ''));
    $senha = trim((string)($body['senha'] ?? ''));

    if ($login === '' || $senha === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'Login e senha são obrigatórios.']);
    }

    $pdo = db();
    ensureWalletSchema($pdo);

    $user = findUserByLogin($pdo, $login);
    if (!$user) {
        jsonResponse(401, ['ok' => false, 'error' => 'Login ou senha inválidos.']);
    }

    $hash = (string)($user['senha'] ?? '');
    if ($hash === '' || !password_verify($senha, $hash)) {
        jsonResponse(401, ['ok' => false, 'error' => 'Login ou senha inválidos.']);
    }

    jsonResponse(200, [
        'ok' => true,
        'usuario' => [
            'id' => (int)$user['id'],
            'nome' => (string)$user['nome'],
            'login' => (string)$user['login'],
            'cpf_cnpj' => (string)$user['cpf_cnpj'],
            'whatsapp' => (string)$user['whatsapp'],
            'email' => (string)($user['email'] ?? ''),
            'saldo' => (float)$user['saldo'],
        ],
    ]);
} catch (Throwable $e) {
    appendAsaasLog('login_erro', [
        'message' => $e->getMessage(),
    ]);
    jsonResponse(500, ['ok' => false, 'error' => 'Erro interno no login.']);
}

