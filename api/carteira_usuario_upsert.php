<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_common.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_db.php';

walletTratarPreflight();
walletValidarMetodo('POST');
walletValidarClienteWeb();
walletAplicarRateLimit('carteira-usuario-upsert', 40, 60);

function walletComprimentoTexto(string $texto): int
{
    if (function_exists('mb_strlen')) {
        return (int)mb_strlen($texto, 'UTF-8');
    }
    return (int)strlen($texto);
}

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
    if ($nome === '' || walletComprimentoTexto($nome) < 2) {
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
                 cpf_cnpj = CASE WHEN :cpf <> \'\' THEN :cpf ELSE cpf_cnpj END
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

    // Log local para depuração em produção (Hostinger).
    $logDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage';
    if (is_dir($logDir) || @mkdir($logDir, 0775, true)) {
        $linha = json_encode([
            'when' => date('Y-m-d H:i:s'),
            'endpoint' => 'carteira_usuario_upsert',
            'error' => $e->getMessage(),
            'code' => (string)$e->getCode(),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (is_string($linha)) {
            @file_put_contents($logDir . DIRECTORY_SEPARATOR . 'wallet_error.log', $linha . PHP_EOL, FILE_APPEND);
        }
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
        'detail' => $e->getMessage(),
        'code' => (string)$e->getCode(),
    ]);
}
