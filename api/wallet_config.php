<?php
declare(strict_types=1);

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

    $cfg = [
        'db_host' => walletEnv('DB_HOST', '127.0.0.1'),
        'db_port' => (int)(walletEnv('DB_PORT', '3306') ?? '3306'),
        'db_name' => walletEnv('DB_NAME', ''),
        'db_user' => walletEnv('DB_USER', ''),
        'db_pass' => walletEnv('DB_PASS', ''),

        'asaas_base_url' => $asaasBase,
        'asaas_api_key' => walletEnv('ASAAS_API_KEY', ''),
        'asaas_webhook_token' => walletEnv('ASAAS_WEBHOOK_TOKEN', ''),

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
