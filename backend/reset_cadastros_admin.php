<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

/*
|---------------------------------------------------------------------------
| RESET DE CADASTROS (uso pontual)
|---------------------------------------------------------------------------
| Objetivo:
| - remover todos os cadastros de usuários
| - remover depósitos e códigos de WhatsApp relacionados
| - manter/criar apenas o usuário admin
|
| Segurança:
| - exige token por querystring (?token=...) ou JSON {"token":"..."}
| - após executar com sucesso, recomenda-se apagar este arquivo do servidor.
*/

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

function readResetTokenFromRequest(): string
{
    $tokenQuery = trim((string)($_GET['token'] ?? ''));
    if ($tokenQuery !== '') {
        return $tokenQuery;
    }

    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return '';
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return '';
    }

    return trim((string)($decoded['token'] ?? ''));
}

function parseEnumFirstValue(string $columnType): string
{
    if (preg_match("/^enum\\((.+)\\)$/i", trim($columnType), $m) !== 1) {
        return '';
    }
    $inside = (string)($m[1] ?? '');
    if ($inside === '') {
        return '';
    }
    $parts = str_getcsv($inside, ',', "'");
    $first = trim((string)($parts[0] ?? ''));
    return $first;
}

function defaultValueByDataType(array $column)
{
    $name = (string)($column['COLUMN_NAME'] ?? '');
    $type = strtolower((string)($column['DATA_TYPE'] ?? ''));
    $columnType = strtolower((string)($column['COLUMN_TYPE'] ?? ''));
    $nullable = strtoupper((string)($column['IS_NULLABLE'] ?? 'NO')) === 'YES';
    $default = $column['COLUMN_DEFAULT'] ?? null;

    if ($name === 'id') {
        return '__SKIP__';
    }

    // Valores explícitos para o admin.
    if ($name === 'login') return 'admin';
    if ($name === 'nome') return 'Administrador';
    if ($name === 'senha' || $name === 'senha_hash') {
        return password_hash('1965917', PASSWORD_DEFAULT);
    }
    if ($name === 'status') return 'ATIVO';
    if ($name === 'saldo') return 0.00;
    if ($name === 'whatsapp_verificado') return 0;
    if ($name === 'cpf_cnpj') return $nullable ? null : '';
    if ($name === 'whatsapp' || $name === 'telefone') return $nullable ? null : '';
    if ($name === 'email') return $nullable ? null : '';
    if (
        $name === 'comissao_percentual' ||
        $name === 'comissao_saldo' ||
        $name === 'comissao_total' ||
        $name === 'total_depositos' ||
        $name === 'saldo_apostador' ||
        $name === 'bonus_indicacao_saldo' ||
        $name === 'bonus_indicacao_total' ||
        $name === 'bonus_indicacao_convertido_total' ||
        $name === 'bonus_indicacao_convertido_hoje' ||
        $name === 'indicados_total'
    ) {
        return 0;
    }
    if (
        $name === 'promotor_id' ||
        $name === 'indicador_id' ||
        $name === 'asaas_customer_id' ||
        $name === 'chave_pix' ||
        $name === 'carteira_usuario_id'
    ) {
        return $nullable ? null : '';
    }
    if (
        $name === 'bloqueado' ||
        $name === 'blocked' ||
        $name === 'suspenso'
    ) {
        return 0;
    }

    // Se há default definido no banco, usamos ele.
    if ($default !== null) {
        return $default;
    }

    // Fallback por tipo.
    if ($nullable) {
        return null;
    }

    if (in_array($type, ['tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint'], true)) {
        return 0;
    }
    if (in_array($type, ['decimal', 'float', 'double', 'real'], true)) {
        return 0;
    }
    if ($type === 'enum') {
        $firstEnum = parseEnumFirstValue($columnType);
        return $firstEnum !== '' ? $firstEnum : '';
    }
    if (in_array($type, ['date'], true)) {
        return date('Y-m-d');
    }
    if (in_array($type, ['datetime', 'timestamp'], true)) {
        return date('Y-m-d H:i:s');
    }
    if ($type === 'time') {
        return date('H:i:s');
    }

    return '';
}

function rebuildPainelSyncFile(): void
{
    $rootDir = dirname(__DIR__);
    $storageDir = $rootDir . DIRECTORY_SEPARATOR . 'storage';
    $filePath = $storageDir . DIRECTORY_SEPARATOR . 'painel_sync.json';

    if (!is_dir($storageDir)) {
        @mkdir($storageDir, 0775, true);
    }

    $payload = [
        // Força timestamp alto para evitar que cache antigo de clientes sobrescreva o reset.
        'updatedAt' => max((int)round(microtime(true) * 1000), 4102444800000),
        'usuarios' => [],
        'apostas' => [],
    ];

    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) {
        return;
    }

    @file_put_contents($filePath, $json);
}

try {
    $tokenInformado = readResetTokenFromRequest();
    $tokenEsperado = trim(envOrDefault('RESET_ADMIN_TOKEN', '1965917'));

    if ($tokenInformado === '' || !hash_equals($tokenEsperado, $tokenInformado)) {
        jsonResponse(403, [
            'ok' => false,
            'error' => 'Token inválido para reset.',
        ]);
    }

    $pdo = db();
    ensureWalletSchemaSafely($pdo);

    $pdo->beginTransaction();

    // Remove dados ligados aos usuários.
    $totalVerificacoes = (int)$pdo->query('SELECT COUNT(*) FROM verificacoes_whatsapp')->fetchColumn();
    $totalDepositos = (int)$pdo->query('SELECT COUNT(*) FROM depositos')->fetchColumn();
    $totalUsuarios = (int)$pdo->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();

    $pdo->exec('DELETE FROM verificacoes_whatsapp');
    $pdo->exec('DELETE FROM depositos');
    $pdo->exec('DELETE FROM usuarios');

    // Descobre colunas atuais para inserir admin sem quebrar em base legada.
    $colsStmt = $pdo->query(
        "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'usuarios'
         ORDER BY ORDINAL_POSITION"
    );
    $columns = $colsStmt->fetchAll(PDO::FETCH_ASSOC);

    if (!is_array($columns) || count($columns) === 0) {
        throw new RuntimeException('Tabela usuarios não encontrada para recriar admin.');
    }

    $insertCols = [];
    $insertMarks = [];
    $params = [];

    foreach ($columns as $column) {
        $name = (string)($column['COLUMN_NAME'] ?? '');
        $value = defaultValueByDataType($column);
        if ($value === '__SKIP__') {
            continue;
        }

        $insertCols[] = $name;
        $mark = ':' . $name;
        $insertMarks[] = $mark;
        $params[$mark] = $value;
    }

    if (count($insertCols) === 0) {
        throw new RuntimeException('Não foi possível montar INSERT do admin.');
    }

    $sqlInsert = 'INSERT INTO usuarios (' . implode(', ', $insertCols) . ') VALUES (' . implode(', ', $insertMarks) . ')';
    $stmtInsert = $pdo->prepare($sqlInsert);
    $stmtInsert->execute($params);

    $adminId = (int)$pdo->lastInsertId();
    $pdo->commit();

    // Limpa sincronização do painel (cadastros/apostas em cache).
    rebuildPainelSyncFile();

    appendAsaasLog('reset_cadastros_admin_ok', [
        'usuarios_removidos' => $totalUsuarios,
        'depositos_removidos' => $totalDepositos,
        'codigos_whatsapp_removidos' => $totalVerificacoes,
        'admin_id' => $adminId,
    ]);

    jsonResponse(200, [
        'ok' => true,
        'message' => 'Cadastros resetados com sucesso. Apenas admin foi mantido.',
        'resumo' => [
            'usuarios_removidos' => $totalUsuarios,
            'depositos_removidos' => $totalDepositos,
            'codigos_whatsapp_removidos' => $totalVerificacoes,
            'admin_id' => $adminId,
        ],
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    appendAsaasLog('reset_cadastros_admin_erro', [
        'message' => $e->getMessage(),
        'code' => (string)$e->getCode(),
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Falha ao resetar cadastros.',
        'debug' => $e->getMessage(),
    ]);
}
