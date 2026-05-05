<?php
// Ativa tipagem estrita para reduzir erro silencioso.
declare(strict_types=1);

// Define timezone padrão do projeto.
date_default_timezone_set('America/Sao_Paulo');

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
    $secretsFile = __DIR__ . DIRECTORY_SEPARATOR . '.secrets.php';
    if (!is_file($secretsFile)) {
        return $cache;
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
function parseMoney(mixed $value): float
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
 * Garante estrutura mínima no banco sem apagar nada existente.
 */
function ensureWalletSchema(PDO $pdo): void
{
    // Tabela de usuários (mínima solicitada + campos auxiliares de integração).
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS usuarios (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            login VARCHAR(80) NOT NULL,
            nome VARCHAR(120) NOT NULL,
            senha VARCHAR(255) NOT NULL,
            cpf_cnpj VARCHAR(18) NOT NULL,
            whatsapp VARCHAR(20) NOT NULL,
            email VARCHAR(150) NULL,
            saldo DECIMAL(14,2) NOT NULL DEFAULT 0.00,
            asaas_customer_id VARCHAR(64) NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_usuarios_login (login),
            KEY idx_usuarios_email (email),
            UNIQUE KEY uq_usuarios_asaas_customer (asaas_customer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Tabela de depósitos (mínima solicitada + colunas de idempotência).
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
            KEY idx_depositos_usuario_status (usuario_id, status),
            CONSTRAINT fk_depositos_usuario
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
                ON UPDATE CASCADE
                ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Adaptação para bancos antigos que já tinham tabela usuarios com colunas diferentes.
    if (!hasColumn($pdo, 'usuarios', 'nome')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN nome VARCHAR(120) NOT NULL DEFAULT 'Usuário'");
    }
    if (!hasColumn($pdo, 'usuarios', 'login')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN login VARCHAR(80) NOT NULL DEFAULT ''");
    }
    if (!hasColumn($pdo, 'usuarios', 'senha')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN senha VARCHAR(255) NOT NULL DEFAULT '' AFTER login");
    }
    if (!hasColumn($pdo, 'usuarios', 'cpf_cnpj')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN cpf_cnpj VARCHAR(18) NOT NULL DEFAULT ''");
    }
    if (!hasColumn($pdo, 'usuarios', 'whatsapp')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN whatsapp VARCHAR(20) NOT NULL DEFAULT '' AFTER cpf_cnpj");
    }
    if (!hasColumn($pdo, 'usuarios', 'email')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN email VARCHAR(150) NULL");
    }
    if (!hasColumn($pdo, 'usuarios', 'saldo')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN saldo DECIMAL(14,2) NOT NULL DEFAULT 0.00");
    }
    if (!hasColumn($pdo, 'usuarios', 'asaas_customer_id')) {
        $pdo->exec("ALTER TABLE usuarios ADD COLUMN asaas_customer_id VARCHAR(64) NULL");
    }

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
        'INSERT INTO usuarios (login, nome, email, cpf_cnpj, saldo)
         VALUES (:login, :nome, :email, :cpf, 0.00)'
    );
    $stmt->execute([
        ':login' => $loginNormalizado,
        ':nome' => $nomeFinal,
        ':email' => $emailFinal,
        ':cpf' => $cpfFinal,
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
    return $nome !== '' && $cpf !== '';
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
