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

    $cpf = normalizeCpf11((string)($body['cpf'] ?? ''));
    $senha = trim((string)($body['senha'] ?? ''));

    if ($cpf === '' || $senha === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'CPF e senha são obrigatórios.']);
    }

    $pdo = db();
    ensureWalletSchemaSafely($pdo);

    if (!hasColumn($pdo, 'usuarios', 'cpf_cnpj')) {
        jsonResponse(500, [
            'ok' => false,
            'error' => 'Tabela usuarios sem coluna cpf_cnpj. Atualize o backend/config.php no servidor.',
        ]);
    }

    $senhaColumn = getUsuariosPasswordColumn($pdo);
    if (!hasColumn($pdo, 'usuarios', $senhaColumn)) {
        jsonResponse(500, [
            'ok' => false,
            'error' => 'Tabela usuarios sem coluna de senha compatível (senha/senha_hash).',
        ]);
    }

    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE cpf_cnpj = :cpf LIMIT 1');
    $stmt->execute([':cpf' => $cpf]);
    $user = $stmt->fetch();
    if (!$user) {
        jsonResponse(401, ['ok' => false, 'error' => 'CPF ou senha inválidos.']);
    }

    $hash = (string)($user[$senhaColumn] ?? '');
    if ($hash === '' || !password_verify($senha, $hash)) {
        jsonResponse(401, ['ok' => false, 'error' => 'CPF ou senha inválidos.']);
    }

    $bloqueado = (int)($user['bloqueado'] ?? 0) === 1;
    $statusAcesso = strtoupper(trim((string)($user['status'] ?? 'ATIVO')));
    if ($bloqueado || $statusAcesso === 'BLOQUEADO') {
        jsonResponse(403, ['ok' => false, 'error' => 'Usuário bloqueado.']);
    }

    try {
        $upLogin = $pdo->prepare('UPDATE usuarios SET ultimo_login_em = NOW() WHERE id = :id LIMIT 1');
        $upLogin->execute([':id' => (int)$user['id']]);
    } catch (Throwable $_e) {
        // Falha não bloqueia login.
    }

    $whatsappRequired = whatsappVerificationEnabled();

    // Exige WhatsApp confirmado apenas quando a funcionalidade estiver ativada.
    if ($whatsappRequired && (int)($user['whatsapp_verificado'] ?? 0) !== 1) {
        jsonResponse(403, [
            'ok' => false,
            'error' => 'Confirme seu WhatsApp para concluir o cadastro.',
            'requires_whatsapp_confirmation' => true,
            'whatsapp_verification_required' => true,
            'usuario' => [
                'id' => (int)$user['id'],
                'nome' => (string)$user['nome'],
                'cpf_cnpj' => (string)$user['cpf_cnpj'],
                'whatsapp' => (string)$user['whatsapp'],
                'whatsapp_verificado' => (int)($user['whatsapp_verificado'] ?? 0),
                'saldo' => number_format((float)$user['saldo'], 2, '.', ''),
            ],
        ]);
    }

    jsonResponse(200, [
        'ok' => true,
        'whatsapp_verification_required' => $whatsappRequired,
        'usuario' => [
            'id' => (int)$user['id'],
            'nome' => (string)$user['nome'],
            'cpf_cnpj' => (string)$user['cpf_cnpj'],
            'whatsapp' => (string)$user['whatsapp'],
            'whatsapp_verificado' => (int)($user['whatsapp_verificado'] ?? 0),
            'saldo' => number_format((float)$user['saldo'], 2, '.', ''),
        ],
    ]);
} catch (Throwable $e) {
    if ($e instanceof PDOException) {
        $sqlState = strtolower((string)$e->getCode());
        if ($sqlState === '42s22') {
            jsonResponse(500, [
                'ok' => false,
                'error' => 'Estrutura da tabela usuarios incompatível (coluna ausente).',
            ]);
        }
        if ($sqlState === '42s02') {
            jsonResponse(500, [
                'ok' => false,
                'error' => 'Tabela usuarios não encontrada no banco configurado.',
            ]);
        }
    }

    appendAsaasLog('login_erro', [
        'message' => $e->getMessage(),
        'code' => (string)$e->getCode(),
    ]);
    jsonResponse(500, ['ok' => false, 'error' => 'Erro interno no login.']);
}
