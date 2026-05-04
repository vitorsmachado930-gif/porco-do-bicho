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
    walletGarantirTabelaUsuarios($pdo);

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

    $pdo->beginTransaction();

    $stmtBusca = $pdo->prepare(
        'SELECT id, login, nome, email, telefone, cpf_cnpj, saldo, status
         FROM usuarios
         WHERE login = :login
         LIMIT 1
         FOR UPDATE'
    );
    $stmtBusca->execute([':login' => $login]);
    $usuarioExistente = $stmtBusca->fetch();

    if ($usuarioExistente) {
        $stmtUpdate = $pdo->prepare(
            'UPDATE usuarios
             SET nome = :nome,
                 email = CASE WHEN :email <> \'\' THEN :email ELSE email END,
                 telefone = CASE WHEN :telefone <> \'\' THEN :telefone ELSE telefone END,
                 cpf_cnpj = CASE
                   WHEN (cpf_cnpj IS NULL OR cpf_cnpj = \'\') AND :cpf <> \'\' THEN :cpf
                   ELSE cpf_cnpj
                 END
             WHERE id = :id
             LIMIT 1'
        );
        $stmtUpdate->execute([
            ':id' => (int)$usuarioExistente['id'],
            ':nome' => $nome,
            ':email' => $email,
            ':telefone' => $telefone,
            ':cpf' => $cpfCnpj,
        ]);
    } else {
        $stmtInsert = $pdo->prepare(
            'INSERT INTO usuarios (login, nome, email, telefone, cpf_cnpj, saldo, status)
             VALUES (:login, :nome, :email, :telefone, :cpf, 0.00, \'ATIVO\')'
        );
        $stmtInsert->execute([
            ':login' => $login,
            ':nome' => $nome,
            ':email' => $email,
            ':telefone' => $telefone,
            ':cpf' => $cpfCnpj,
        ]);
    }

    $stmtSelect = $pdo->prepare('SELECT id, login, nome, saldo, status FROM usuarios WHERE login = :login LIMIT 1');
    $stmtSelect->execute([':login' => $login]);
    $user = $stmtSelect->fetch();
    if (!$user) {
        throw new RuntimeException('Usuario nao encontrado apos sincronizacao.');
    }
    $pdo->commit();

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
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $msg = 'Falha ao sincronizar usuario da carteira.';
    if ($e instanceof PDOException) {
        $sqlState = (string)($e->getCode() ?? '');
        if ($sqlState === '42S02') {
            $msg = 'Falha ao sincronizar usuario: tabela "usuarios" nao encontrada na base SQL.';
        } elseif ($sqlState === '42S22') {
            $msg = 'Falha ao sincronizar usuario: coluna ausente na tabela "usuarios".';
        }
    }
    walletResponder(500, [
        'ok' => false,
        'error' => $msg,
    ]);
}
