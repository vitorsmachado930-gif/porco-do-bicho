<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', '0');

$tokenEsperado = '1965917';
$token = isset($_GET['token']) ? (string)$_GET['token'] : '';
if ($token !== $tokenEsperado) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'token_invalido']);
    exit;
}

$result = [
    'ok' => true,
    'php_version' => PHP_VERSION,
    'cwd' => __DIR__,
    'files' => [],
    'checks' => [],
];

$arquivos = [
    'config.php',
    'cadastro.php',
    'login.php',
    'criar_pix.php',
    'enviar_codigo_whatsapp.php',
    'validar_codigo.php',
    'validar_codigo_core.php',
    'confirmar_whatsapp.php',
    '.secrets.php',
    'secrets.php',
];

foreach ($arquivos as $a) {
    $path = __DIR__ . DIRECTORY_SEPARATOR . $a;
    $result['files'][$a] = [
        'exists' => is_file($path),
        'size' => is_file($path) ? filesize($path) : 0,
        'mtime' => is_file($path) ? date('Y-m-d H:i:s', (int)filemtime($path)) : null,
    ];
}

try {
    require_once __DIR__ . '/config.php';
    $result['checks']['config_include'] = 'ok';
} catch (Throwable $e) {
    $result['ok'] = false;
    $result['checks']['config_include'] = [
        'erro' => $e->getMessage(),
        'tipo' => get_class($e),
        'linha' => $e->getLine(),
        'arquivo' => $e->getFile(),
    ];
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$result['checks']['functions'] = [
    'db' => function_exists('db'),
    'ensureWalletSchemaSafely' => function_exists('ensureWalletSchemaSafely'),
    'whatsappVerificationEnabled' => function_exists('whatsappVerificationEnabled'),
    'getPendingUsersTable' => function_exists('getPendingUsersTable'),
];

try {
    $pdo = db();
    $result['checks']['db_connect'] = 'ok';
    ensureWalletSchemaSafely($pdo);
    $result['checks']['ensureWalletSchemaSafely'] = 'ok';

    if (function_exists('getPendingUsersTable')) {
        $result['checks']['pending_table'] = getPendingUsersTable($pdo);
    }

    $result['checks']['whatsapp_required'] = function_exists('whatsappVerificationEnabled')
        ? whatsappVerificationEnabled()
        : null;
} catch (Throwable $e) {
    $result['ok'] = false;
    $result['checks']['db_error'] = [
        'erro' => $e->getMessage(),
        'tipo' => get_class($e),
        'linha' => $e->getLine(),
        'arquivo' => $e->getFile(),
    ];
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
