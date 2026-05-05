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
    $nome = trim((string)($body['nome'] ?? ''));
    $cpf = normalizeCpf11((string)($body['cpf'] ?? ''));
    $whatsapp = normalizeWhatsapp((string)($body['whatsapp'] ?? ''));
    $emailRaw = trim((string)($body['email'] ?? ''));
    $email = $emailRaw !== '' ? filter_var($emailRaw, FILTER_VALIDATE_EMAIL) : '';

    if ($login === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'Login obrigatório.']);
    }
    if (strlen($senha) < 6) {
        jsonResponse(422, ['ok' => false, 'error' => 'Senha deve ter no mínimo 6 caracteres.']);
    }
    if ($nome === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'Nome obrigatório.']);
    }
    if ($cpf === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'CPF inválido. Informe 11 dígitos válidos.']);
    }
    if ($whatsapp === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'WhatsApp obrigatório.']);
    }
    if ($emailRaw !== '' && $email === false) {
        jsonResponse(422, ['ok' => false, 'error' => 'E-mail inválido.']);
    }

    $senhaHash = password_hash($senha, PASSWORD_DEFAULT);
    if (!is_string($senhaHash) || $senhaHash === '') {
        throw new RuntimeException('Falha ao criptografar senha.');
    }

    $pdo = db();
    ensureWalletSchema($pdo);

    $existe = findUserByLogin($pdo, $login);
    if ($existe) {
        jsonResponse(409, ['ok' => false, 'error' => 'Login já cadastrado.']);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO usuarios (nome, login, senha, cpf_cnpj, whatsapp, email, saldo)
         VALUES (:nome, :login, :senha, :cpf, :whatsapp, :email, 0.00)'
    );
    $stmt->execute([
        ':nome' => $nome,
        ':login' => $login,
        ':senha' => $senhaHash,
        ':cpf' => $cpf,
        ':whatsapp' => $whatsapp,
        ':email' => is_string($email) ? $email : '',
    ]);

    $id = (int)$pdo->lastInsertId();
    $user = findUserById($pdo, $id);
    if (!$user) {
        throw new RuntimeException('Falha ao carregar usuário recém-cadastrado.');
    }

    jsonResponse(201, [
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
    appendAsaasLog('cadastro_erro', [
        'message' => $e->getMessage(),
    ]);
    jsonResponse(500, ['ok' => false, 'error' => 'Erro interno no cadastro.']);
}

