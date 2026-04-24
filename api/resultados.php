<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function responder(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$rootDir = dirname(__DIR__);
$storageDir = $rootDir . DIRECTORY_SEPARATOR . 'storage';
$filePath = $storageDir . DIRECTORY_SEPARATOR . 'resultados_sync.json';

if (!is_dir($storageDir) && !mkdir($storageDir, 0775, true) && !is_dir($storageDir)) {
    responder(500, [
        'ok' => false,
        'error' => 'Nao foi possivel preparar o armazenamento.'
    ]);
}

if (!file_exists($filePath)) {
    $inicial = [
        'updatedAt' => 0,
        'resultados' => []
    ];
    file_put_contents($filePath, json_encode($inicial, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

function lerEstado(string $filePath): array
{
    $raw = @file_get_contents($filePath);
    if ($raw === false || trim($raw) === '') {
        return [
            'updatedAt' => 0,
            'resultados' => []
        ];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [
            'updatedAt' => 0,
            'resultados' => []
        ];
    }

    $updatedAt = isset($decoded['updatedAt']) ? (int)$decoded['updatedAt'] : 0;
    $resultados = isset($decoded['resultados']) && is_array($decoded['resultados'])
        ? $decoded['resultados']
        : [];

    return [
        'updatedAt' => $updatedAt > 0 ? $updatedAt : 0,
        'resultados' => $resultados
    ];
}

function salvarEstado(string $filePath, array $estado): void
{
    $json = json_encode($estado, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Falha ao gerar JSON.');
    }

    $fp = fopen($filePath, 'c+');
    if ($fp === false) {
        throw new RuntimeException('Falha ao abrir arquivo.');
    }

    try {
        if (!flock($fp, LOCK_EX)) {
            throw new RuntimeException('Falha ao bloquear arquivo.');
        }

        ftruncate($fp, 0);
        rewind($fp);

        if (fwrite($fp, $json) === false) {
            throw new RuntimeException('Falha ao gravar arquivo.');
        }

        fflush($fp);
        flock($fp, LOCK_UN);
    } finally {
        fclose($fp);
    }
}

if ($method === 'GET') {
    $estado = lerEstado($filePath);
    responder(200, [
        'ok' => true,
        'updatedAt' => $estado['updatedAt'],
        'resultados' => $estado['resultados']
    ]);
}

if ($method !== 'POST') {
    responder(405, [
        'ok' => false,
        'error' => 'Metodo nao permitido.'
    ]);
}

$rawInput = file_get_contents('php://input');
if (!is_string($rawInput) || trim($rawInput) === '') {
    responder(400, [
        'ok' => false,
        'error' => 'Payload vazio.'
    ]);
}

if (strlen($rawInput) > 2 * 1024 * 1024) {
    responder(413, [
        'ok' => false,
        'error' => 'Payload muito grande.'
    ]);
}

$payload = json_decode($rawInput, true);
if (!is_array($payload)) {
    responder(400, [
        'ok' => false,
        'error' => 'JSON invalido.'
    ]);
}

$updatedAt = isset($payload['updatedAt']) ? (int)$payload['updatedAt'] : 0;
$resultados = isset($payload['resultados']) && is_array($payload['resultados'])
    ? $payload['resultados']
    : null;

if ($updatedAt <= 0 || $resultados === null) {
    responder(422, [
        'ok' => false,
        'error' => 'Campos obrigatorios invalidos.'
    ]);
}

$estadoAtual = lerEstado($filePath);
if ($estadoAtual['updatedAt'] > $updatedAt) {
    responder(409, [
        'ok' => false,
        'error' => 'Conflito de sincronizacao.',
        'updatedAt' => $estadoAtual['updatedAt'],
        'resultados' => $estadoAtual['resultados']
    ]);
}

$novoEstado = [
    'updatedAt' => $updatedAt,
    'resultados' => $resultados
];

try {
    salvarEstado($filePath, $novoEstado);
} catch (Throwable $e) {
    responder(500, [
        'ok' => false,
        'error' => 'Falha ao salvar resultados.'
    ]);
}

responder(200, [
    'ok' => true,
    'updatedAt' => $updatedAt
]);
