<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_common.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_db.php';

walletTratarPreflight();
walletValidarMetodo('POST');
walletValidarClienteWeb();
walletAplicarRateLimit('carteira-usuario-upsert', 40, 60);

try {
    walletValidarConfiguracaoMinima(false);
    $pdo = walletPdo();

    $payload = walletBodyJson();
    $login = walletNormalizarLogin($payload['login'] ?? '');
    $nome = trim((string)($payload['nome'] ?? ''));
    $cpfCnpj = walletNormalizarCpfCnpj(isset($payload['cpfCnpj']) ? (string)$payload['cpfCnpj'] : '');
    $email = trim((string)($payload['email'] ?? ''));
    $telefone = walletDigitos((string)($payload['telefone'] ?? ''));

    if ($login === '' || strlen($login) < 3) {
        walletResponder(422, ['ok' => false, 'error' => 'Login invalido.']);
    }
    if ($nome === '' || mb_strlen($nome) < 2) {
        walletResponder(422, ['ok' => false, 'error' => 'Nome invalido.']);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO usuarios (login, nome, email, telefone, cpf_cnpj, saldo, status)
         VALUES (:login, :nome, :email, :telefone, :cpf, 0.00, \'ATIVO\')
         ON DUPLICATE KEY UPDATE
            nome = VALUES(nome),
            email = CASE WHEN VALUES(email) <> \'\' THEN VALUES(email) ELSE email END,
            telefone = CASE WHEN VALUES(telefone) <> \'\' THEN VALUES(telefone) ELSE telefone END,
            cpf_cnpj = CASE WHEN (cpf_cnpj IS NULL OR cpf_cnpj = \'\') AND VALUES(cpf_cnpj) <> \'\' THEN VALUES(cpf_cnpj) ELSE cpf_cnpj END,
            updated_at = NOW()'
    );

    $stmt->execute([
        ':login' => $login,
        ':nome' => $nome,
        ':email' => $email,
        ':telefone' => $telefone,
        ':cpf' => $cpfCnpj,
    ]);

    $stmtSelect = $pdo->prepare('SELECT id, login, nome, saldo, status FROM usuarios WHERE login = :login LIMIT 1');
    $stmtSelect->execute([':login' => $login]);
    $user = $stmtSelect->fetch();

    walletResponder(200, [
        'ok' => true,
        'usuario' => [
            'id' => (int)$user['id'],
            'login' => (string)$user['login'],
            'nome' => (string)$user['nome'],
            'saldo' => (float)$user['saldo'],
            'status' => (string)$user['status'],
        ],
    ]);
} catch (Throwable $e) {
    walletResponder(500, [
        'ok' => false,
        'error' => 'Falha ao sincronizar usuario da carteira.',
    ]);
}
