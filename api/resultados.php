<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'security.php';
apiEnviarCabecalhosSeguranca();

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
$backupsDir = $storageDir . DIRECTORY_SEPARATOR . 'backups';
$backupRetencaoDias = 30;

if (!is_dir($storageDir) && !mkdir($storageDir, 0775, true) && !is_dir($storageDir)) {
    responder(500, [
        'ok' => false,
        'error' => 'Nao foi possivel preparar o armazenamento.'
    ]);
}

if (!is_dir($backupsDir) && !mkdir($backupsDir, 0775, true) && !is_dir($backupsDir)) {
    responder(500, [
        'ok' => false,
        'error' => 'Nao foi possivel preparar os backups.'
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

function salvarBackupDiario(string $backupsDir, array $estado, int $updatedAt): string
{
    $timezone = new DateTimeZone('America/Sao_Paulo');
    $timestampSegundos = (int)floor($updatedAt / 1000);
    if ($timestampSegundos <= 0) {
        $timestampSegundos = time();
    }

    $dataBase = (new DateTimeImmutable('@' . $timestampSegundos))->setTimezone($timezone);
    $dataArquivo = $dataBase->format('Y-m-d');
    $backupPath = $backupsDir . DIRECTORY_SEPARATOR . 'resultados-' . $dataArquivo . '.json';

    $conteudoBackup = [
        'backupDate' => $dataBase->format(DATE_ATOM),
        'updatedAt' => isset($estado['updatedAt']) ? (int)$estado['updatedAt'] : 0,
        'resultados' => isset($estado['resultados']) && is_array($estado['resultados'])
            ? $estado['resultados']
            : []
    ];

    salvarEstado($backupPath, $conteudoBackup);
    return basename($backupPath);
}

function limparBackupsAntigos(string $backupsDir, int $retencaoDias): void
{
    if ($retencaoDias <= 0) {
        return;
    }

    $timezone = new DateTimeZone('America/Sao_Paulo');
    $limite = (new DateTimeImmutable('now', $timezone))
        ->modify('-' . $retencaoDias . ' days')
        ->format('Y-m-d');

    $arquivos = glob($backupsDir . DIRECTORY_SEPARATOR . 'resultados-*.json');
    if (!is_array($arquivos)) {
        return;
    }

    foreach ($arquivos as $arquivo) {
        $nome = basename($arquivo);
        if (!preg_match('/^resultados-(\d{4}-\d{2}-\d{2})\.json$/', $nome, $match)) {
            continue;
        }

        $dataArquivo = $match[1];
        if ($dataArquivo < $limite) {
            @unlink($arquivo);
        }
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

if (!apiValidarClienteAplicacao() && (!apiValidarOrigemEscrita() || !apiValidarRequisicaoAjax())) {
    responder(403, [
        'ok' => false,
        'error' => 'Cliente nao autorizado.'
    ]);
}

$rateLimit = apiAplicarRateLimit('resultados-post', 120, 300);
if (!$rateLimit['ok']) {
    header('Retry-After: ' . (string)($rateLimit['retryAfter'] ?? 60));
    responder(429, [
        'ok' => false,
        'error' => 'Limite de requisicoes excedido. Tente novamente em instantes.'
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
$resultados = null;
$estadoAtual = lerEstado($filePath);

if (isset($payload['resultados']) && is_array($payload['resultados'])) {
    $resultados = $payload['resultados'];
} elseif (isset($payload['resultado']) && is_array($payload['resultado'])) {
    $entrada = $payload['resultado'];
    $data = isset($entrada['data']) ? trim((string)$entrada['data']) : '';
    $praca = isset($entrada['praca']) ? trim((string)$entrada['praca']) : '';
    $loteria = isset($entrada['loteria']) ? trim((string)$entrada['loteria']) : '';
    $listaResultados = isset($entrada['resultados']) && is_array($entrada['resultados'])
        ? $entrada['resultados']
        : [];

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $data) || $praca === '' || $loteria === '' || count($listaResultados) === 0) {
        responder(422, [
            'ok' => false,
            'error' => 'Resultado individual invalido.'
        ]);
    }

    $idEntrada = isset($entrada['id']) && is_numeric($entrada['id']) ? (int)$entrada['id'] : 0;
    $listaAtual = isset($estadoAtual['resultados']) && is_array($estadoAtual['resultados'])
        ? $estadoAtual['resultados']
        : [];

    $novoItem = [
        'id' => $idEntrada > 0 ? $idEntrada : (int)round(microtime(true) * 1000),
        'praca' => $praca,
        'data' => $data,
        'loteria' => $loteria,
        'resultados' => $listaResultados
    ];

    $substituiu = false;
    foreach ($listaAtual as $idx => $existente) {
        if (!is_array($existente)) {
            continue;
        }
        $mesmaData = isset($existente['data']) && (string)$existente['data'] === $data;
        $mesmaPraca = isset($existente['praca']) && (string)$existente['praca'] === $praca;
        $mesmaLoteria = isset($existente['loteria']) && (string)$existente['loteria'] === $loteria;
        if ($mesmaData && $mesmaPraca && $mesmaLoteria) {
            if ($idEntrada <= 0 && isset($existente['id']) && is_numeric($existente['id'])) {
                $novoItem['id'] = (int)$existente['id'];
            }
            $listaAtual[$idx] = $novoItem;
            $substituiu = true;
            break;
        }
    }

    if (!$substituiu) {
        $listaAtual[] = $novoItem;
    }

    $resultados = $listaAtual;
}

if ($updatedAt <= 0 || $resultados === null) {
    responder(422, [
        'ok' => false,
        'error' => 'Campos obrigatorios invalidos.'
    ]);
}

$agoraMs = (int)round(microtime(true) * 1000);
$updatedAtAtual = isset($estadoAtual['updatedAt']) ? (int)$estadoAtual['updatedAt'] : 0;
$updatedAtFinal = max($updatedAt, $updatedAtAtual + 1, $agoraMs);

$novoEstado = [
    'updatedAt' => $updatedAtFinal,
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

$backupArquivo = '';
$backupStatus = 'ok';
try {
    $backupArquivo = salvarBackupDiario($backupsDir, $novoEstado, $updatedAt);
    limparBackupsAntigos($backupsDir, $backupRetencaoDias);
} catch (Throwable $e) {
    $backupStatus = 'falha';
}

responder(200, [
    'ok' => true,
    'updatedAt' => $updatedAtFinal,
    'backup' => [
        'status' => $backupStatus,
        'arquivo' => $backupArquivo,
        'retencaoDias' => $backupRetencaoDias
    ]
]);
