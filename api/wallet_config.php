<?php
declare(strict_types=1);

// Fallback opcional: reaproveita constantes já configuradas no backend.
// Isso evita erro 500 quando variáveis de ambiente do /api não foram definidas.
$backendConfig = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'backend' . DIRECTORY_SEPARATOR . 'config.php';
if (is_file($backendConfig)) {
    require_once $backendConfig;
}

function walletEnv(string $key, ?string $default = null): ?string
{
    $valor = getenv($key);
    if ($valor === false) {
        return $default;
    }
    $valor = trim((string)$valor);
    if ($valor === '') {
        return $default;
    }
    return $valor;
}

function walletConfig(): array
{
    static $cfg = null;
    if (is_array($cfg)) {
        return $cfg;
    }

    $asaasBase = walletEnv('ASAAS_BASE_URL', 'https://api-sandbox.asaas.com/v3');
    $asaasBase = rtrim((string)$asaasBase, '/');

    $defaultDbHost = defined('DB_HOST') ? (string)constant('DB_HOST') : '127.0.0.1';
    $defaultDbPort = defined('DB_PORT') ? (string)constant('DB_PORT') : '3306';
    $defaultDbName = defined('DB_NAME') ? (string)constant('DB_NAME') : '';
    $defaultDbUser = defined('DB_USER') ? (string)constant('DB_USER') : '';
    $defaultDbPass = defined('DB_PASS') ? (string)constant('DB_PASS') : '';

    $defaultAsaasBase = defined('ASAAS_BASE_URL') ? (string)constant('ASAAS_BASE_URL') : 'https://api-sandbox.asaas.com/v3';
    $defaultAsaasKey = defined('ASAAS_API_KEY') ? (string)constant('ASAAS_API_KEY') : '';
    $defaultWebhookToken = defined('ASAAS_WEBHOOK_TOKEN') ? (string)constant('ASAAS_WEBHOOK_TOKEN') : '';

    // Se backend/config.php estiver carregado, aproveita envOrDefault()
    // para também ler backend/.secrets.php sem expor no Git.
    if (function_exists('envOrDefault')) {
        $defaultDbHost = envOrDefault('DB_HOST', $defaultDbHost);
        $defaultDbPort = envOrDefault('DB_PORT', $defaultDbPort);
        $defaultDbName = envOrDefault('DB_NAME', $defaultDbName);
        $defaultDbUser = envOrDefault('DB_USER', $defaultDbUser);
        $defaultDbPass = envOrDefault('DB_PASS', $defaultDbPass);
        $defaultAsaasBase = envOrDefault('ASAAS_BASE_URL', $defaultAsaasBase);
        $defaultAsaasKey = envOrDefault('ASAAS_API_KEY', $defaultAsaasKey);
        $defaultWebhookToken = envOrDefault('ASAAS_WEBHOOK_TOKEN', $defaultWebhookToken);
    }

    $cfg = [
        'db_host' => walletEnv('DB_HOST', $defaultDbHost),
        'db_port' => (int)(walletEnv('DB_PORT', $defaultDbPort) ?? $defaultDbPort),
        'db_name' => walletEnv('DB_NAME', $defaultDbName),
        'db_user' => walletEnv('DB_USER', $defaultDbUser),
        'db_pass' => walletEnv('DB_PASS', $defaultDbPass),

        'asaas_base_url' => walletEnv('ASAAS_BASE_URL', $defaultAsaasBase) ?: $asaasBase,
        'asaas_api_key' => walletEnv('ASAAS_API_KEY', $defaultAsaasKey),
        'asaas_webhook_token' => walletEnv('ASAAS_WEBHOOK_TOKEN', $defaultWebhookToken),

        // Quantos dias para vencimento da cobranca PIX
        'pix_due_days' => max(1, (int)(walletEnv('ASAAS_PIX_DUE_DAYS', '1') ?? '1')),
    ];

    $arquivoSegredo = __DIR__ . DIRECTORY_SEPARATOR . 'wallet_secrets.php';
    if (is_file($arquivoSegredo)) {
        $segredos = require $arquivoSegredo;
        if (is_array($segredos)) {
            $cfg = array_merge($cfg, $segredos);
            $cfg['db_port'] = (int)($cfg['db_port'] ?? 3306);
            $cfg['pix_due_days'] = max(1, (int)($cfg['pix_due_days'] ?? 1));
        }
    }

    return $cfg;
}

function walletValidarConfiguracaoMinima(bool $precisaAsaas = false): void
{
    $cfg = walletConfig();

    if ($cfg['db_name'] === '' || $cfg['db_user'] === '') {
        throw new RuntimeException('Configuracao de banco incompleta (DB_NAME/DB_USER).');
    }

    if ($precisaAsaas && $cfg['asaas_api_key'] === '') {
        throw new RuntimeException('Configuracao Asaas ausente (ASAAS_API_KEY).');
    }
}
