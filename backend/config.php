<?php
// Ativa tipagem estrita para reduzir erro silencioso.
declare(strict_types=1);

// Define timezone padrão do projeto.
date_default_timezone_set('America/Sao_Paulo');

// Compatibilidade com versões antigas do PHP (ex.: 7.4 na hospedagem).
if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool
    {
        if ($needle === '') {
            return true;
        }
        return strpos($haystack, $needle) === 0;
    }
}

if (!function_exists('str_contains')) {
    function str_contains(string $haystack, string $needle): bool
    {
        if ($needle === '') {
            return true;
        }
        return strpos($haystack, $needle) !== false;
    }
}

/*
|--------------------------------------------------------------------------
| CONFIGURAÇÃO DE AMBIENTE (Hostinger / local)
|--------------------------------------------------------------------------
| Você pode preencher aqui OU via variáveis de ambiente no servidor.
| NUNCA coloque estes valores no frontend.
*/
const DB_HOST = 'localhost';
const DB_PORT = 3306;
const DB_NAME = 'SEU_BANCO_MYSQL';
const DB_USER = 'SEU_USUARIO_MYSQL';
const DB_PASS = 'SUA_SENHA_MYSQL';

// Produção: https://api.asaas.com/v3
const ASAAS_BASE_URL = 'https://api.asaas.com/v3';
const ASAAS_API_KEY = 'SUA_CHAVE_API_PRODUCAO_ASAAS';

// Token opcional de validação do webhook (header asaas-access-token).
const ASAAS_WEBHOOK_TOKEN = 'SEU_TOKEN_WEBHOOK_ASAAS';

// Caminho do arquivo de log do webhook.
const ASAAS_LOG_FILE = __DIR__ . '/asaas_log.txt';

// Configuração do provedor WhatsApp (Meta Cloud API por padrão).
const WHATSAPP_PROVIDER = 'meta';
const WHATSAPP_TOKEN = 'COLE_AQUI';
const WHATSAPP_PHONE_NUMBER_ID = 'COLE_AQUI';
const WHATSAPP_TEMPLATE_NAME = '';
const WHATSAPP_TEMPLATE_LANG = 'en_US';
const WHATSAPP_VERIFICATION_ENABLED = false;

/**
 * Lê variável de ambiente e usa fallback constante quando não existir.
 */
function loadLocalSecrets(): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $cache = [];
    $candidateFiles = [
        __DIR__ . DIRECTORY_SEPARATOR . '.secrets.php',
        __DIR__ . DIRECTORY_SEPARATOR . 'secrets.php',
        __DIR__ . DIRECTORY_SEPARATOR . 'secrets.local.php',
    ];

    foreach ($candidateFiles as $secretsFile) {
        if (!is_file($secretsFile)) {
            continue;
        }

        $data = require $secretsFile;
        if (is_array($data)) {
            foreach ($data as $k => $v) {
                $key = trim((string)$k);
                $val = trim((string)$v);
                if ($key !== '' && $val !== '') {
                    $cache[$key] = $val;
                }
            }
        }

        // Primeiro arquivo válido já é suficiente.
        if (!empty($cache)) {
            return $cache;
        }
    }

    return $cache;
}

function envOrDefault(string $envName, string $default): string
{
    $value = getenv($envName);
    if (is_string($value) && trim($value) !== '') {
        return trim($value);
    }

    $local = loadLocalSecrets();
    if (isset($local[$envName]) && trim((string)$local[$envName]) !== '') {
        return trim((string)$local[$envName]);
    }

    return $default;
}

/**
 * Lê variável booleana de ambiente/secrets.
 */
function envBool(string $envName, bool $default): bool
{
    $raw = envOrDefault($envName, $default ? '1' : '0');
    $value = strtolower(trim($raw));
    if ($value === '') {
        return $default;
    }

    $truthy = ['1', 'true', 'on', 'yes', 'sim'];
    $falsy = ['0', 'false', 'off', 'no', 'nao', 'não'];

    if (in_array($value, $truthy, true)) {
        return true;
    }
    if (in_array($value, $falsy, true)) {
        return false;
    }

    return $default;
}

/**
 * Define se a verificação de WhatsApp está obrigatória no cadastro/login/pix.
 */
function whatsappVerificationEnabled(): bool
{
    return envBool('WHATSAPP_VERIFICATION_ENABLED', WHATSAPP_VERIFICATION_ENABLED);
}

/**
 * Retorna conexão PDO única.
 */
function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = envOrDefault('DB_HOST', DB_HOST);
    $port = (int)envOrDefault('DB_PORT', (string)DB_PORT);
    $name = envOrDefault('DB_NAME', DB_NAME);
    $user = envOrDefault('DB_USER', DB_USER);
    $pass = envOrDefault('DB_PASS', DB_PASS);

    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $name);

    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

/**
 * Resposta JSON padrão.
 */
function jsonResponse(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Resposta texto simples.
 */
function textResponse(int $status, string $text): void
{
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $text;
    exit;
}

/**
 * Lê JSON do corpo da requisição.
 */
function getJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        jsonResponse(400, ['ok' => false, 'error' => 'JSON inválido.']);
    }

    return $decoded;
}

/**
 * Normaliza valor monetário em float com 2 casas.
 */
function parseMoney($value): float
{
    if (is_string($value)) {
        $tmp = str_replace(['R$', ' ', '.'], '', $value);
        $tmp = str_replace(',', '.', $tmp);
        $num = (float)$tmp;
    } else {
        $num = (float)$value;
    }

    if (!is_finite($num)) {
        return 0.0;
    }

    return (float)number_format($num, 2, '.', '');
}

/**
 * Mantém apenas dígitos.
 */
function onlyDigits(string $value): string
{
    return preg_replace('/\D+/', '', $value) ?? '';
}

/**
 * Normaliza login para minúsculo e sem espaços.
 */
function normalizeLogin(string $value): string
{
    return strtolower(preg_replace('/\s+/', '', trim($value)) ?? '');
}

/**
 * Normaliza CPF para 11 dígitos.
 */
function normalizeCpf11(string $value): string
{
    $cpf = onlyDigits($value);
    if (strlen($cpf) !== 11) {
        return '';
    }
    if (preg_match('/^(\d)\1{10}$/', $cpf)) {
        return '';
    }
    return $cpf;
}

/**
 * Normaliza WhatsApp para apenas dígitos.
 */
function normalizeWhatsapp(string $value): string
{
    return onlyDigits($value);
}

/**
 * Log simples no arquivo backend/asaas_log.txt.
 */
function appendAsaasLog(string $title, array $context = []): void
{
    $line = [
        'when' => date('Y-m-d H:i:s'),
        'title' => $title,
        'context' => $context,
    ];

    $encoded = json_encode($line, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($encoded)) {
        $encoded = '{"when":"' . date('Y-m-d H:i:s') . '","title":"log_encode_error"}';
    }

    @file_put_contents(ASAAS_LOG_FILE, $encoded . PHP_EOL, FILE_APPEND);
}

/**
 * Faz requisição HTTP na API do Asaas.
 */
function asaasRequest(string $method, string $path, ?array $body = null): array
{
    $base = envOrDefault('ASAAS_BASE_URL', ASAAS_BASE_URL);
    $apiKey = envOrDefault('ASAAS_API_KEY', ASAAS_API_KEY);

    if (
        $apiKey === '' ||
        str_starts_with($apiKey, 'SUA_API_KEY') ||
        str_starts_with($apiKey, 'SUA_CHAVE')
    ) {
        throw new RuntimeException('API Key do Asaas não configurada no backend/config.php.');
    }

    $url = rtrim($base, '/') . '/' . ltrim($path, '/');
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('Falha ao iniciar cURL.');
    }

    $headers = [
        'accept: application/json',
        'content-type: application/json',
        'access_token: ' . $apiKey,
        'user-agent: porcodobicho-asaas/2.0',
    ];

    $payload = null;
    if ($body !== null) {
        $payload = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($payload === false) {
            throw new RuntimeException('Falha ao converter body para JSON.');
        }
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);

    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    }

    $respRaw = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($respRaw === false) {
        throw new RuntimeException('Erro de rede ao chamar Asaas: ' . $curlError);
    }

    $respJson = json_decode((string)$respRaw, true);
    if (!is_array($respJson)) {
        $respJson = ['raw' => (string)$respRaw];
    }

    return [
        'status' => $status,
        'body' => $respJson,
    ];
}

/**
 * Obtém header da requisição sem depender de servidor específico.
 */
function getHeaderValue(string $name): string
{
    $target = strtolower($name);

    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $key => $value) {
                if (strtolower((string)$key) === $target) {
                    return trim((string)$value);
                }
            }
        }
    }

    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$serverKey] ?? '';
    return trim((string)$value);
}

/**
 * Verifica existência de coluna para migração segura.
 */
function hasColumn(PDO $pdo, string $table, string $column): bool
{
    $sql = 'SELECT COUNT(*) AS total
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table
              AND COLUMN_NAME = :column';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':table' => $table,
        ':column' => $column,
    ]);

    $row = $stmt->fetch();
    return (int)($row['total'] ?? 0) > 0;
}

/**
 * Verifica se índice já existe.
 */
function hasIndex(PDO $pdo, string $table, string $indexName): bool
{
    $sql = 'SELECT COUNT(*) AS total
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table
              AND INDEX_NAME = :index_name';

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':table' => $table,
        ':index_name' => $indexName,
    ]);

    $row = $stmt->fetch();
    return (int)($row['total'] ?? 0) > 0;
}

/**
 * Verifica se tabela existe no schema atual.
 */
function hasTable(PDO $pdo, string $table): bool
{
    $sql = 'SELECT COUNT(*) AS total
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':table' => $table]);
    $row = $stmt->fetch();
    return (int)($row['total'] ?? 0) > 0;
}

/**
 * Nome da tabela de cadastros pendentes (com fallback para legado).
 */
function getPendingUsersTable(PDO $pdo): string
{
    if (hasTable($pdo, 'usuarios_pendentes')) {
        return 'usuarios_pendentes';
    }
    if (hasTable($pdo, 'usuarios_temp')) {
        return 'usuarios_temp';
    }
    return 'usuarios_pendentes';
}

/**
 * Executa SQL e, em caso de erro, apenas registra log sem derrubar o fluxo.
 */
function safeExec(PDO $pdo, string $sql, string $logTitle): void
{
    try {
        $pdo->exec($sql);
    } catch (Throwable $e) {
        appendAsaasLog($logTitle, [
            'sql' => $sql,
            'message' => $e->getMessage(),
        ]);
    }
}

/**
 * Obtém coluna de senha existente na tabela usuarios (compatibilidade).
 */
function getUsuariosPasswordColumn(PDO $pdo): string
{
    if (hasColumn($pdo, 'usuarios', 'senha')) {
        return 'senha';
    }
    if (hasColumn($pdo, 'usuarios', 'senha_hash')) {
        return 'senha_hash';
    }
    return 'senha';
}

/**
 * Garante estrutura mínima no banco sem apagar nada existente.
 */
function ensureWalletSchema(PDO $pdo): void
{
    // Tabela de usuários (mínima solicitada + campos auxiliares de integração).
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS usuarios (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            login VARCHAR(80) NULL,
            nome VARCHAR(120) NOT NULL,
            senha VARCHAR(255) NOT NULL DEFAULT '',
            cpf_cnpj VARCHAR(18) NULL,
            whatsapp VARCHAR(20) NULL,
            whatsapp_verificado TINYINT(1) NOT NULL DEFAULT 0,
            email VARCHAR(150) NULL,
            saldo DECIMAL(14,2) NOT NULL DEFAULT 0.00,
            asaas_customer_id VARCHAR(64) NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_usuarios_login (login),
            UNIQUE KEY uq_usuarios_cpf (cpf_cnpj),
            UNIQUE KEY uq_usuarios_whatsapp (whatsapp),
            KEY idx_usuarios_email (email),
            UNIQUE KEY uq_usuarios_asaas_customer (asaas_customer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Tabela de depósitos (mínima solicitada + colunas de idempotência).
    // Em bases legadas, constraint FK pode falhar e travar cadastro/login.
    // Mantemos tabela sem FK rígida para não derrubar o fluxo principal.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS depositos (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            usuario_id BIGINT UNSIGNED NOT NULL,
            asaas_payment_id VARCHAR(80) NULL,
            external_reference VARCHAR(80) NULL,
            valor DECIMAL(14,2) NOT NULL,
            status ENUM('PENDENTE','PAGO','CANCELADO','EXPIRADO','FALHOU') NOT NULL DEFAULT 'PENDENTE',
            payload_pix TEXT NULL,
            qr_code_base64 LONGTEXT NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            pago_em DATETIME NULL,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            asaas_event_id VARCHAR(120) NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_depositos_payment (asaas_payment_id),
            UNIQUE KEY uq_depositos_external_ref (external_reference),
            UNIQUE KEY uq_depositos_evento (asaas_event_id),
            KEY idx_depositos_usuario_status (usuario_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Adaptação para bancos antigos que já tinham tabela usuarios com colunas diferentes.
    if (!hasColumn($pdo, 'usuarios', 'nome')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN nome VARCHAR(120) NOT NULL DEFAULT 'Usuário'");
    }
    if (!hasColumn($pdo, 'usuarios', 'login')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN login VARCHAR(80) NULL");
    }
    if (!hasColumn($pdo, 'usuarios', 'senha')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN senha VARCHAR(255) NOT NULL DEFAULT '' AFTER login");
    }
    if (!hasColumn($pdo, 'usuarios', 'cpf_cnpj')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN cpf_cnpj VARCHAR(18) NULL");
    }
    if (!hasColumn($pdo, 'usuarios', 'whatsapp')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN whatsapp VARCHAR(20) NULL AFTER cpf_cnpj");
    }
    if (!hasColumn($pdo, 'usuarios', 'whatsapp_verificado')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN whatsapp_verificado TINYINT(1) NOT NULL DEFAULT 0 AFTER whatsapp");
    }
    if (!hasColumn($pdo, 'usuarios', 'email')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN email VARCHAR(150) NULL");
    }
    if (!hasColumn($pdo, 'usuarios', 'saldo')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN saldo DECIMAL(14,2) NOT NULL DEFAULT 0.00");
    }
    if (!hasColumn($pdo, 'usuarios', 'status')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ATIVO'");
    }
    if (!hasColumn($pdo, 'usuarios', 'asaas_customer_id')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN asaas_customer_id VARCHAR(64) NULL");
    }

    // Mantém CPF/WhatsApp como NULL quando vazio para permitir índice único sem bloquear base antiga.
    safeExec($pdo, "UPDATE usuarios SET cpf_cnpj = NULL WHERE TRIM(COALESCE(cpf_cnpj, '')) = ''", 'schema_fix_cpf_null');
    safeExec($pdo, "UPDATE usuarios SET whatsapp = NULL WHERE TRIM(COALESCE(whatsapp, '')) = ''", 'schema_fix_whatsapp_null');
    safeExec($pdo, "ALTER TABLE usuarios MODIFY login VARCHAR(80) NULL", 'schema_fix_login_nullable');
    // Para o novo fluxo simplificado, usa CPF como login apenas quando não houver risco de duplicidade.
    safeExec(
        $pdo,
        "UPDATE usuarios u
         JOIN (
            SELECT cpf_cnpj
            FROM usuarios
            WHERE cpf_cnpj IS NOT NULL AND TRIM(cpf_cnpj) <> ''
            GROUP BY cpf_cnpj
            HAVING COUNT(*) = 1
         ) c ON c.cpf_cnpj = u.cpf_cnpj
         LEFT JOIN usuarios l ON l.login = u.cpf_cnpj AND l.id <> u.id
         SET u.login = u.cpf_cnpj
         WHERE (u.login IS NULL OR TRIM(u.login) = '')
           AND l.id IS NULL",
        'schema_fix_login_from_cpf'
    );
    safeExec($pdo, "ALTER TABLE usuarios MODIFY cpf_cnpj VARCHAR(18) NULL", 'schema_fix_cpf_len');
    safeExec($pdo, "ALTER TABLE usuarios MODIFY whatsapp VARCHAR(20) NULL", 'schema_fix_whatsapp_len');

    // Tenta garantir login único sem quebrar base com duplicados legados.
    if (!hasIndex($pdo, 'usuarios', 'uq_usuarios_login')) {
        $dupStmt = $pdo->query(
            "SELECT login
             FROM usuarios
             GROUP BY login
             HAVING COUNT(*) > 1
             LIMIT 1"
        );
        $temDuplicado = (bool)$dupStmt->fetch();
        if (!$temDuplicado) {
            $pdo->exec("ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_login (login)");
        } else {
            appendAsaasLog('schema_warning_login_duplicado', [
                'tabela' => 'usuarios',
                'indice' => 'uq_usuarios_login',
            ]);
        }
    }

    // Garante CPF único sem quebrar base legada com CPF repetido.
    if (!hasIndex($pdo, 'usuarios', 'uq_usuarios_cpf')) {
        $dupCpfStmt = $pdo->query(
            "SELECT cpf_cnpj
             FROM usuarios
             WHERE TRIM(COALESCE(cpf_cnpj, '')) <> ''
             GROUP BY cpf_cnpj
             HAVING COUNT(*) > 1
             LIMIT 1"
        );
        $temCpfDuplicado = (bool)$dupCpfStmt->fetch();
        if (!$temCpfDuplicado) {
            $pdo->exec("ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_cpf (cpf_cnpj)");
        } else {
            appendAsaasLog('schema_warning_cpf_duplicado', [
                'tabela' => 'usuarios',
                'indice' => 'uq_usuarios_cpf',
            ]);
        }
    }

    // Garante WhatsApp único sem quebrar base legada com telefone repetido.
    if (!hasIndex($pdo, 'usuarios', 'uq_usuarios_whatsapp')) {
        $dupWhatsStmt = $pdo->query(
            "SELECT whatsapp
             FROM usuarios
             WHERE TRIM(COALESCE(whatsapp, '')) <> ''
             GROUP BY whatsapp
             HAVING COUNT(*) > 1
             LIMIT 1"
        );
        $temWhatsappDuplicado = (bool)$dupWhatsStmt->fetch();
        if (!$temWhatsappDuplicado) {
            $pdo->exec("ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_whatsapp (whatsapp)");
        } else {
            appendAsaasLog('schema_warning_whatsapp_duplicado', [
                'tabela' => 'usuarios',
                'indice' => 'uq_usuarios_whatsapp',
            ]);
        }
    }

    // Adaptação para bancos antigos na tabela de depositos.
    if (!hasColumn($pdo, 'depositos', 'payload_pix')) {
        $pdo->exec("ALTER TABLE depositos ADD COLUMN payload_pix TEXT NULL");
    }
    if (!hasColumn($pdo, 'depositos', 'criado_em')) {
        $pdo->exec("ALTER TABLE depositos ADD COLUMN criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    }
    if (!hasColumn($pdo, 'depositos', 'atualizado_em')) {
        $pdo->exec("ALTER TABLE depositos ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    }
    if (!hasColumn($pdo, 'depositos', 'external_reference')) {
        $pdo->exec("ALTER TABLE depositos ADD COLUMN external_reference VARCHAR(80) NULL");
    }
    if (!hasColumn($pdo, 'depositos', 'asaas_event_id')) {
        $pdo->exec("ALTER TABLE depositos ADD COLUMN asaas_event_id VARCHAR(120) NULL");
    }

    // Tabela temporária de cadastro (só vira usuário definitivo após código correto).
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS usuarios_pendentes (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            nome VARCHAR(120) NOT NULL,
            cpf_cnpj VARCHAR(18) NOT NULL,
            whatsapp VARCHAR(20) NOT NULL,
            senha_hash VARCHAR(255) NOT NULL,
            codigo_verificacao VARCHAR(6) NOT NULL,
            expira_em DATETIME NOT NULL,
            tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0,
            verificado TINYINT(1) NOT NULL DEFAULT 0,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_usuarios_pendentes_cpf (cpf_cnpj),
            UNIQUE KEY uq_usuarios_pendentes_whatsapp (whatsapp),
            KEY idx_usuarios_pendentes_expira (expira_em),
            KEY idx_usuarios_pendentes_verificado (verificado, expira_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Ajustes de compatibilidade para usuarios_pendentes em bases antigas.
    if (!hasColumn($pdo, 'usuarios_pendentes', 'nome')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN nome VARCHAR(120) NOT NULL DEFAULT 'Usuário'");
    }
    if (!hasColumn($pdo, 'usuarios_pendentes', 'cpf_cnpj')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN cpf_cnpj VARCHAR(18) NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_pendentes', 'whatsapp')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN whatsapp VARCHAR(20) NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_pendentes', 'senha_hash')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN senha_hash VARCHAR(255) NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_pendentes', 'codigo_verificacao')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN codigo_verificacao VARCHAR(6) NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_pendentes', 'expira_em')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN expira_em DATETIME NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_pendentes', 'tentativas')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0");
    }
    if (!hasColumn($pdo, 'usuarios_pendentes', 'verificado')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN verificado TINYINT(1) NOT NULL DEFAULT 0");
    }
    if (!hasColumn($pdo, 'usuarios_pendentes', 'criado_em')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    }
    if (!hasColumn($pdo, 'usuarios_pendentes', 'atualizado_em')) {
        $pdo->exec("ALTER TABLE usuarios_pendentes ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    }

    // Migração leve de legado (usuarios_temp -> usuarios_pendentes), sem derrubar produção.
    if (hasTable($pdo, 'usuarios_temp')) {
        safeExec(
            $pdo,
            "INSERT INTO usuarios_pendentes
                (nome, cpf_cnpj, whatsapp, senha_hash, codigo_verificacao, expira_em, tentativas, verificado, criado_em, atualizado_em)
             SELECT
                t.nome, t.cpf_cnpj, t.whatsapp, t.senha_hash, t.codigo_verificacao, t.expira_em, t.tentativas, t.verificado, t.criado_em, t.atualizado_em
             FROM usuarios_temp t
             LEFT JOIN usuarios_pendentes p ON p.cpf_cnpj = t.cpf_cnpj
             WHERE p.id IS NULL",
            'schema_migracao_usuarios_temp_pendentes'
        );
    }

    // Mantido por compatibilidade com instalações antigas.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS usuarios_temp (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            nome VARCHAR(120) NOT NULL,
            cpf_cnpj VARCHAR(18) NOT NULL,
            whatsapp VARCHAR(20) NOT NULL,
            senha_hash VARCHAR(255) NOT NULL,
            codigo_verificacao VARCHAR(6) NOT NULL,
            expira_em DATETIME NOT NULL,
            tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0,
            verificado TINYINT(1) NOT NULL DEFAULT 0,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_usuarios_temp_cpf (cpf_cnpj),
            UNIQUE KEY uq_usuarios_temp_whatsapp (whatsapp),
            KEY idx_usuarios_temp_expira (expira_em),
            KEY idx_usuarios_temp_verificado (verificado, expira_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Ajustes de compatibilidade para usuarios_temp em bases antigas.
    if (!hasColumn($pdo, 'usuarios_temp', 'nome')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN nome VARCHAR(120) NOT NULL DEFAULT 'Usuário'");
    }
    if (!hasColumn($pdo, 'usuarios_temp', 'cpf_cnpj')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN cpf_cnpj VARCHAR(18) NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_temp', 'whatsapp')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN whatsapp VARCHAR(20) NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_temp', 'senha_hash')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN senha_hash VARCHAR(255) NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_temp', 'codigo_verificacao')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN codigo_verificacao VARCHAR(6) NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_temp', 'expira_em')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN expira_em DATETIME NOT NULL");
    }
    if (!hasColumn($pdo, 'usuarios_temp', 'tentativas')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0");
    }
    if (!hasColumn($pdo, 'usuarios_temp', 'verificado')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN verificado TINYINT(1) NOT NULL DEFAULT 0");
    }
    if (!hasColumn($pdo, 'usuarios_temp', 'criado_em')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    }
    if (!hasColumn($pdo, 'usuarios_temp', 'atualizado_em')) {
        $pdo->exec("ALTER TABLE usuarios_temp ADD COLUMN atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    }

    // Tabela de verificação de WhatsApp.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS verificacoes_whatsapp (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            usuario_id BIGINT UNSIGNED NOT NULL,
            whatsapp VARCHAR(20) NOT NULL,
            codigo VARCHAR(6) NOT NULL,
            verificado TINYINT(1) NOT NULL DEFAULT 0,
            expira_em DATETIME NOT NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_usuario_whatsapp (usuario_id, whatsapp),
            KEY idx_codigo (codigo),
            KEY idx_whatsapp_criado (whatsapp, criado_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Colunas extras de governança/admin em usuários (compatível com base atual).
    if (!hasColumn($pdo, 'usuarios', 'perfil')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD COLUMN perfil VARCHAR(20) NOT NULL DEFAULT 'apostador' AFTER senha", 'schema_add_usuarios_perfil');
    }
    if (!hasColumn($pdo, 'usuarios', 'promotor_id')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD COLUMN promotor_id BIGINT UNSIGNED NULL AFTER perfil", 'schema_add_usuarios_promotor_id');
    }
    if (!hasColumn($pdo, 'usuarios', 'indicador_id')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD COLUMN indicador_id BIGINT UNSIGNED NULL AFTER promotor_id", 'schema_add_usuarios_indicador_id');
    }
    if (!hasColumn($pdo, 'usuarios', 'comissao_percentual')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD COLUMN comissao_percentual DECIMAL(7,2) NOT NULL DEFAULT 0.00 AFTER indicador_id", 'schema_add_usuarios_comissao_percentual');
    }
    if (!hasColumn($pdo, 'usuarios', 'bloqueado')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD COLUMN bloqueado TINYINT(1) NOT NULL DEFAULT 0 AFTER status", 'schema_add_usuarios_bloqueado');
    }
    if (!hasColumn($pdo, 'usuarios', 'chave_pix')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD COLUMN chave_pix VARCHAR(180) NULL AFTER whatsapp", 'schema_add_usuarios_chave_pix');
    }
    if (!hasColumn($pdo, 'usuarios', 'ultimo_login_em')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD COLUMN ultimo_login_em DATETIME NULL AFTER chave_pix", 'schema_add_usuarios_ultimo_login_em');
    }
    safeExec($pdo, "UPDATE usuarios SET perfil = 'admin' WHERE LOWER(TRIM(COALESCE(login, ''))) = 'admin'", 'schema_fix_admin_perfil');
    if (!hasIndex($pdo, 'usuarios', 'idx_usuarios_perfil')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD KEY idx_usuarios_perfil (perfil)", 'schema_add_idx_usuarios_perfil');
    }
    if (!hasIndex($pdo, 'usuarios', 'idx_usuarios_promotor_id')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD KEY idx_usuarios_promotor_id (promotor_id)", 'schema_add_idx_usuarios_promotor_id');
    }
    if (!hasIndex($pdo, 'usuarios', 'idx_usuarios_indicador_id')) {
        safeExec($pdo, "ALTER TABLE usuarios ADD KEY idx_usuarios_indicador_id (indicador_id)", 'schema_add_idx_usuarios_indicador_id');
    }

    // Tabela de promotores (metadados administrativos do papel promotor).
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS promotores (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            usuario_id BIGINT UNSIGNED NOT NULL,
            nome_exibicao VARCHAR(120) NULL,
            comissao_percentual DECIMAL(7,2) NOT NULL DEFAULT 0.00,
            ativo TINYINT(1) NOT NULL DEFAULT 1,
            observacoes TEXT NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_promotores_usuario_id (usuario_id),
            KEY idx_promotores_ativo (ativo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Mapa de indicação: quem indicou quem.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS indicacoes (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            indicador_usuario_id BIGINT UNSIGNED NOT NULL,
            indicado_usuario_id BIGINT UNSIGNED NOT NULL,
            origem VARCHAR(40) NOT NULL DEFAULT 'link',
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_indicacoes_indicado (indicado_usuario_id),
            KEY idx_indicacoes_indicador (indicador_usuario_id),
            KEY idx_indicacoes_origem (origem)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Comissões de promotor/indicação.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS comissoes (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            promotor_usuario_id BIGINT UNSIGNED NOT NULL,
            apostador_usuario_id BIGINT UNSIGNED NULL,
            deposito_id BIGINT UNSIGNED NULL,
            referencia_tipo VARCHAR(40) NOT NULL DEFAULT 'deposito',
            referencia_id VARCHAR(120) NULL,
            base_valor DECIMAL(14,2) NOT NULL DEFAULT 0.00,
            percentual DECIMAL(7,2) NOT NULL DEFAULT 0.00,
            valor_comissao DECIMAL(14,2) NOT NULL DEFAULT 0.00,
            status VARCHAR(20) NOT NULL DEFAULT 'pendente',
            pago_em DATETIME NULL,
            observacao TEXT NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_comissoes_promotor_status (promotor_usuario_id, status),
            KEY idx_comissoes_deposito (deposito_id),
            KEY idx_comissoes_criado (criado_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Solicitações de saque.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS saques (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            usuario_id BIGINT UNSIGNED NOT NULL,
            valor DECIMAL(14,2) NOT NULL,
            chave_pix VARCHAR(180) NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pendente',
            observacao TEXT NULL,
            comprovante_url VARCHAR(255) NULL,
            aprovado_por_admin_id BIGINT UNSIGNED NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            pago_em DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_saques_usuario_status (usuario_id, status),
            KEY idx_saques_criado (criado_em),
            KEY idx_saques_admin (aprovado_por_admin_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Movimentações de saldo (auditoria financeira).
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS movimentacoes_saldo (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            usuario_id BIGINT UNSIGNED NOT NULL,
            tipo VARCHAR(30) NOT NULL,
            valor DECIMAL(14,2) NOT NULL,
            saldo_antes DECIMAL(14,2) NOT NULL DEFAULT 0.00,
            saldo_depois DECIMAL(14,2) NOT NULL DEFAULT 0.00,
            referencia_tipo VARCHAR(40) NULL,
            referencia_id VARCHAR(120) NULL,
            motivo VARCHAR(255) NULL,
            admin_responsavel_id BIGINT UNSIGNED NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_mov_saldo_usuario (usuario_id, criado_em),
            KEY idx_mov_saldo_tipo (tipo, criado_em),
            KEY idx_mov_saldo_admin (admin_responsavel_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Registro de prêmios pagos/apurados para relatórios administrativos.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS premios (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            usuario_id BIGINT UNSIGNED NOT NULL,
            aposta_referencia VARCHAR(120) NULL,
            loteria VARCHAR(80) NULL,
            data_apuracao DATE NULL,
            valor_premio DECIMAL(14,2) NOT NULL DEFAULT 0.00,
            status VARCHAR(20) NOT NULL DEFAULT 'apurado',
            pago_em DATETIME NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_premios_usuario_status (usuario_id, status),
            KEY idx_premios_data (data_apuracao)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Auditoria administrativa.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS auditoria_admin (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            admin_id BIGINT UNSIGNED NULL,
            admin_login VARCHAR(80) NULL,
            acao VARCHAR(80) NOT NULL,
            entidade VARCHAR(80) NOT NULL,
            entidade_id VARCHAR(120) NULL,
            valor_antigo LONGTEXT NULL,
            valor_novo LONGTEXT NULL,
            justificativa VARCHAR(255) NULL,
            ip VARCHAR(60) NULL,
            user_agent VARCHAR(255) NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_auditoria_admin_acao (acao, criado_em),
            KEY idx_auditoria_admin_entidade (entidade, criado_em),
            KEY idx_auditoria_admin_admin (admin_id, criado_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Histórico de edição de resultados.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS resultados_historico (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            data_resultado DATE NOT NULL,
            praca VARCHAR(80) NOT NULL,
            loteria VARCHAR(80) NOT NULL,
            payload_anterior LONGTEXT NULL,
            payload_novo LONGTEXT NULL,
            admin_id BIGINT UNSIGNED NULL,
            admin_login VARCHAR(80) NULL,
            motivo VARCHAR(255) NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_resultados_hist_data_loteria (data_resultado, loteria),
            KEY idx_resultados_hist_admin (admin_id, criado_em)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

/**
 * Tenta aplicar migração automática sem derrubar endpoint em produção.
 */
function ensureWalletSchemaSafely(PDO $pdo): void
{
    try {
        ensureWalletSchema($pdo);
    } catch (Throwable $e) {
        appendAsaasLog('schema_safe_exception', [
            'message' => $e->getMessage(),
            'code' => (string)$e->getCode(),
        ]);
    }
}

/**
 * Localiza usuário por ID.
 */
function findUserById(PDO $pdo, int $usuarioId): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $usuarioId]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

/**
 * Localiza usuário por login normalizado.
 */
function findUserByLogin(PDO $pdo, string $login): ?array
{
    $loginNormalizado = normalizeLogin($login);
    if ($loginNormalizado === '') {
        return null;
    }

    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE login = :login LIMIT 1');
    $stmt->execute([':login' => $loginNormalizado]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

/**
 * Cria ou atualiza usuário por login para uso no fluxo de depósito Pix.
 */
function upsertUserByLogin(PDO $pdo, string $login, string $nome, string $email = '', string $cpfCnpj = ''): array
{
    $loginNormalizado = normalizeLogin($login);
    if ($loginNormalizado === '') {
        throw new RuntimeException('Login inválido para sincronizar usuário do depósito.');
    }

    $nomeFinal = trim($nome) !== '' ? trim($nome) : ('Usuário ' . $loginNormalizado);
    $emailFinal = trim($email);
    $cpfFinal = normalizeCpf11($cpfCnpj);
    try {
        $senhaTemporaria = password_hash(bin2hex(random_bytes(8)), PASSWORD_DEFAULT);
    } catch (Throwable $_e) {
        $senhaTemporaria = password_hash(uniqid('tmp_', true), PASSWORD_DEFAULT);
    }
    if (!is_string($senhaTemporaria) || $senhaTemporaria === '') {
        $senhaTemporaria = '';
    }

    $existente = findUserByLogin($pdo, $loginNormalizado);
    if ($existente) {
        $stmt = $pdo->prepare(
            'UPDATE usuarios
             SET nome = :nome,
                 email = CASE WHEN :email <> "" THEN :email ELSE email END,
                 cpf_cnpj = CASE WHEN :cpf <> "" THEN :cpf ELSE cpf_cnpj END
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([
            ':nome' => $nomeFinal,
            ':email' => $emailFinal,
            ':cpf' => $cpfFinal,
            ':id' => (int)$existente['id'],
        ]);
        $atualizado = findUserById($pdo, (int)$existente['id']);
        if (!$atualizado) {
            throw new RuntimeException('Falha ao atualizar usuário do depósito.');
        }
        return $atualizado;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO usuarios (login, nome, senha, email, cpf_cnpj, whatsapp, whatsapp_verificado, saldo)
         VALUES (:login, :nome, :senha, :email, :cpf, :whatsapp, 0, 0.00)'
    );
    $stmt->execute([
        ':login' => $loginNormalizado,
        ':nome' => $nomeFinal,
        ':senha' => $senhaTemporaria,
        ':email' => $emailFinal,
        ':cpf' => $cpfFinal,
        ':whatsapp' => null,
    ]);

    $novoId = (int)$pdo->lastInsertId();
    $novo = findUserById($pdo, $novoId);
    if (!$novo) {
        throw new RuntimeException('Falha ao criar usuário do depósito.');
    }
    return $novo;
}

/**
 * Verifica se cadastro mínimo para Pix está completo.
 */
function userReadyForPix(array $usuario): bool
{
    $nome = trim((string)($usuario['nome'] ?? ''));
    $cpf = normalizeCpf11((string)($usuario['cpf_cnpj'] ?? ''));
    $whatsapp = normalizeWhatsapp((string)($usuario['whatsapp'] ?? ''));
    $whatsappVerificado = (int)($usuario['whatsapp_verificado'] ?? 0) === 1;
    if (whatsappVerificationEnabled()) {
        return $nome !== '' && $cpf !== '' && $whatsapp !== '' && $whatsappVerificado;
    }
    return $nome !== '' && $cpf !== '' && $whatsapp !== '';
}

/**
 * Cria ou localiza customer no Asaas.
 */
function getOrCreateAsaasCustomer(PDO $pdo, array $usuario): string
{
    $userId = (int)($usuario['id'] ?? 0);
    $storedCustomer = trim((string)($usuario['asaas_customer_id'] ?? ''));
    if ($storedCustomer !== '') {
        return $storedCustomer;
    }

    // Asaas exige CPF/CNPJ válido no cadastro do customer.
    $cpf = normalizeCpf11((string)($usuario['cpf_cnpj'] ?? ''));
    if ($cpf === '') {
        throw new RuntimeException('CPF obrigatório para criar cliente no Asaas (11 dígitos).');
    }

    $nome = trim((string)($usuario['nome'] ?? 'Usuário'));
    if ($nome === '') {
        $nome = 'Usuário ' . $userId;
    }

    $email = trim((string)($usuario['email'] ?? ''));

    $payload = [
        'name' => $nome,
        'cpfCnpj' => $cpf,
        'externalReference' => 'usuario_' . $userId,
    ];
    if ($email !== '') {
        $payload['email'] = $email;
    }

    $resp = asaasRequest('POST', '/customers', $payload);

    if ($resp['status'] < 200 || $resp['status'] >= 300) {
        appendAsaasLog('erro_criar_customer', [
            'usuario_id' => $userId,
            'status' => $resp['status'],
            'body' => $resp['body'],
        ]);
        throw new RuntimeException('Falha ao criar cliente no Asaas. Verifique CPF/CNPJ do usuário.');
    }

    $customerId = trim((string)($resp['body']['id'] ?? ''));
    if ($customerId === '') {
        throw new RuntimeException('Asaas não retornou ID do customer.');
    }

    $up = $pdo->prepare('UPDATE usuarios SET asaas_customer_id = :customer WHERE id = :id LIMIT 1');
    $up->execute([
        ':customer' => $customerId,
        ':id' => $userId,
    ]);

    return $customerId;
}

/**
 * Normaliza telefone para formato E.164 Brasil (55DDDNÚMERO).
 */
function normalizeWhatsappToE164Br(string $whatsapp): string
{
    $digits = normalizeWhatsapp($whatsapp);
    if ($digits === '') {
        return '';
    }

    if (str_starts_with($digits, '55')) {
        return $digits;
    }

    return '55' . $digits;
}

/**
 * Envia o código pelo provedor configurado.
 */
function sendWhatsappCode(string $numero, string $codigo): bool
{
    $provider = strtolower(trim(envOrDefault('WHATSAPP_PROVIDER', WHATSAPP_PROVIDER)));

    if ($provider === '' || $provider === 'meta') {
        return sendWhatsappCodeMeta($numero, $codigo);
    }

    // Espaço para provedores externos customizados.
    appendAsaasLog('whatsapp_provider_nao_suportado', [
        'provider' => $provider,
    ]);
    return false;
}

/**
 * Envia mensagem usando Meta WhatsApp Cloud API.
 */
function sendWhatsappCodeMeta(string $numero, string $codigo): bool
{
    $token = trim(envOrDefault('WHATSAPP_TOKEN', WHATSAPP_TOKEN));
    $phoneNumberId = trim(envOrDefault('WHATSAPP_PHONE_NUMBER_ID', WHATSAPP_PHONE_NUMBER_ID));
    $templateName = trim(envOrDefault('WHATSAPP_TEMPLATE_NAME', WHATSAPP_TEMPLATE_NAME));
    $templateLang = trim(envOrDefault('WHATSAPP_TEMPLATE_LANG', WHATSAPP_TEMPLATE_LANG));
    $to = normalizeWhatsappToE164Br($numero);

    if ($token === '' || $phoneNumberId === '' || $to === '') {
        appendAsaasLog('whatsapp_envio_config_invalida', [
            'tem_token' => $token !== '',
            'tem_phone_id' => $phoneNumberId !== '',
            'numero_ok' => $to !== '',
        ]);
        return false;
    }

    $url = 'https://graph.facebook.com/v25.0/' . rawurlencode($phoneNumberId) . '/messages';

    $postMessage = static function (array $body) use ($url, $token): array {
        $payload = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($payload) || $payload === '') {
            return ['ok' => false, 'status' => 0, 'resp' => 'json_encode_failed'];
        }

        $ch = curl_init($url);
        if ($ch === false) {
            return ['ok' => false, 'status' => 0, 'resp' => 'curl_init_failed'];
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);

        $respRaw = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($respRaw === false) {
            return ['ok' => false, 'status' => 0, 'resp' => 'curl_error:' . $curlError];
        }

        return [
            'ok' => $status >= 200 && $status < 300,
            'status' => $status,
            'resp' => (string)$respRaw,
        ];
    };

    // 1) Se template estiver configurado, envia ele primeiro para abrir a conversa.
    if ($templateName !== '') {
        $templateBody = [
            'messaging_product' => 'whatsapp',
            'to' => $to,
            'type' => 'template',
            'template' => [
                'name' => $templateName,
                'language' => [
                    'code' => $templateLang !== '' ? $templateLang : 'en_US',
                ],
            ],
        ];
        $templateResp = $postMessage($templateBody);
        if (!$templateResp['ok']) {
            appendAsaasLog('whatsapp_envio_erro_http', [
                'etapa' => 'template',
                'status' => $templateResp['status'],
                'resposta' => $templateResp['resp'],
            ]);
            return false;
        }
    }

    // 2) Envia o código real em texto.
    $textBody = [
        'messaging_product' => 'whatsapp',
        'to' => $to,
        'type' => 'text',
        'text' => [
            'body' => 'Seu código de confirmação do Porco do Bicho é: ' . $codigo . '. Ele expira em 10 minutos.',
        ],
    ];
    $textResp = $postMessage($textBody);
    if (!$textResp['ok']) {
        appendAsaasLog('whatsapp_envio_erro_http', [
            'etapa' => 'texto_codigo',
            'status' => $textResp['status'],
            'resposta' => $textResp['resp'],
        ]);
        return false;
    }

    return true;
}
