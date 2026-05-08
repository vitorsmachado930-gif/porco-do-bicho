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

    $usuarioId = (int)($body['usuario_id'] ?? 0);
    $cpfAtual = normalizeCpf11((string)($body['cpf_atual'] ?? ''));
    $novoCpf = normalizeCpf11((string)($body['novo_cpf'] ?? ''));
    $senha = trim((string)($body['senha'] ?? ''));

    if ($novoCpf === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'Informe um CPF válido com 11 dígitos.']);
    }

    if ($senha === '') {
        jsonResponse(422, ['ok' => false, 'error' => 'Senha obrigatória para atualizar CPF.']);
    }

    $pdo = db();
    ensureWalletSchemaSafely($pdo);

    $user = null;
    if ($usuarioId > 0) {
        $user = findUserById($pdo, $usuarioId);
    }

    if (!$user && $cpfAtual !== '') {
        $stmtCpf = $pdo->prepare('SELECT * FROM usuarios WHERE cpf_cnpj = :cpf LIMIT 1');
        $stmtCpf->execute([':cpf' => $cpfAtual]);
        $user = $stmtCpf->fetch() ?: null;
    }

    if (!is_array($user)) {
        jsonResponse(404, ['ok' => false, 'error' => 'Usuário não encontrado para atualizar CPF.']);
    }

    $senhaColumn = getUsuariosPasswordColumn($pdo);
    $hash = (string)($user[$senhaColumn] ?? '');
    if ($hash === '' || !password_verify($senha, $hash)) {
        jsonResponse(401, ['ok' => false, 'error' => 'Senha inválida para atualização de CPF.']);
    }

    $usuarioIdReal = (int)($user['id'] ?? 0);
    $cpfBanco = normalizeCpf11((string)($user['cpf_cnpj'] ?? ''));

    if ($cpfBanco === $novoCpf) {
        jsonResponse(200, [
            'ok' => true,
            'message' => 'CPF já está atualizado.',
            'usuario' => [
                'id' => $usuarioIdReal,
                'login' => (string)($user['login'] ?? ''),
                'cpf_cnpj' => $cpfBanco,
            ],
        ]);
    }

    $stmtDup = $pdo->prepare('SELECT id FROM usuarios WHERE cpf_cnpj = :cpf AND id <> :id LIMIT 1');
    $stmtDup->execute([
        ':cpf' => $novoCpf,
        ':id' => $usuarioIdReal,
    ]);
    if ($stmtDup->fetch()) {
        jsonResponse(409, ['ok' => false, 'error' => 'CPF já cadastrado para outro usuário.']);
    }

    $colunas = ['cpf_cnpj = :novo_cpf'];
    $params = [
        ':novo_cpf' => $novoCpf,
        ':id' => $usuarioIdReal,
    ];

    if (hasColumn($pdo, 'usuarios', 'login')) {
        $loginAtual = normalizeLogin((string)($user['login'] ?? ''));
        // Se login atual é o CPF antigo (ou vazio), acompanha o novo CPF.
        if ($loginAtual === '' || ($cpfBanco !== '' && $loginAtual === $cpfBanco)) {
            $colunas[] = 'login = :novo_login';
            $params[':novo_login'] = $novoCpf;
        }
    }

    if (hasColumn($pdo, 'usuarios', 'updated_at')) {
        $colunas[] = 'updated_at = NOW()';
    }
    if (hasColumn($pdo, 'usuarios', 'atualizado_em')) {
        $colunas[] = 'atualizado_em = NOW()';
    }

    $sql = 'UPDATE usuarios SET ' . implode(', ', $colunas) . ' WHERE id = :id LIMIT 1';
    $up = $pdo->prepare($sql);
    $up->execute($params);

    $atualizado = findUserById($pdo, $usuarioIdReal);
    if (!is_array($atualizado)) {
        throw new RuntimeException('Falha ao recarregar usuário após atualização de CPF.');
    }

    appendAsaasLog('perfil_cpf_atualizado', [
        'usuario_id' => $usuarioIdReal,
        'cpf_antigo' => $cpfBanco,
        'cpf_novo' => $novoCpf,
    ]);

    jsonResponse(200, [
        'ok' => true,
        'message' => 'CPF atualizado com sucesso.',
        'usuario' => [
            'id' => $usuarioIdReal,
            'login' => (string)($atualizado['login'] ?? ''),
            'cpf_cnpj' => (string)($atualizado['cpf_cnpj'] ?? ''),
        ],
    ]);
} catch (Throwable $e) {
    appendAsaasLog('perfil_cpf_erro', [
        'message' => $e->getMessage(),
        'code' => (string)$e->getCode(),
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Erro interno ao atualizar CPF.',
    ]);
}
