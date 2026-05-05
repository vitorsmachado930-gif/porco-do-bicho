<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_common.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_db.php';

walletTratarPreflight();
walletValidarMetodo('POST');
walletValidarClienteWeb();
walletAplicarRateLimit('carteira-saldo-usuario', 120, 60);

try {
    walletValidarConfiguracaoMinima(false);
    $pdo = walletPdo();
    walletGarantirTabelaUsuarios($pdo);

    $payload = walletBodyJson();
    $login = walletNormalizarLogin((string)($payload['login'] ?? ''));
    $senha = walletValidarSenhaTexto($payload['senha'] ?? '');
    if ($login === '') {
        walletResponder(422, ['ok' => false, 'error' => 'Login obrigatorio.']);
    }
    if ($senha === '') {
        walletResponder(422, ['ok' => false, 'error' => 'Senha obrigatoria.']);
    }

    $stmt = $pdo->prepare(
        'SELECT id, login, nome, senha_hash, saldo, status FROM usuarios WHERE login = :login LIMIT 1'
    );
    $stmt->execute([':login' => $login]);
    $user = $stmt->fetch();

    if (!$user) {
        walletResponder(404, ['ok' => false, 'error' => 'Usuario nao encontrado na carteira.']);
    }
    if (!walletSenhaConfere($senha, $user['senha_hash'] ?? '')) {
        walletResponder(403, ['ok' => false, 'error' => 'Credenciais invalidas.']);
    }

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
        'error' => 'Falha ao consultar saldo.',
    ]);
}
