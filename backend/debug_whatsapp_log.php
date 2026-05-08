<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'GET') {
    jsonResponse(405, [
        'ok' => false,
        'error' => 'Método não permitido.',
    ]);
}

$tokenRecebido = trim((string)($_GET['token'] ?? ''));
$tokenEsperado = trim(envOrDefault('RESET_ADMIN_TOKEN', '1965917'));
if ($tokenRecebido === '' || !hash_equals($tokenEsperado, $tokenRecebido)) {
    jsonResponse(403, [
        'ok' => false,
        'error' => 'Token inválido.',
    ]);
}

$file = ASAAS_LOG_FILE;
if (!is_file($file)) {
    jsonResponse(200, [
        'ok' => true,
        'lines' => [],
    ]);
}

$raw = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
if (!is_array($raw)) {
    jsonResponse(500, [
        'ok' => false,
        'error' => 'Falha ao ler arquivo de log.',
    ]);
}

$lines = array_slice($raw, -40);
jsonResponse(200, [
    'ok' => true,
    'total' => count($raw),
    'lines' => $lines,
]);

