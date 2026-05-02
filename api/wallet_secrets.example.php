<?php
// Copie para api/wallet_secrets.php e preencha.
// O arquivo wallet_secrets.php e protegido por api/.htaccess.

return [
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'SEU_BANCO',
    'db_user' => 'SEU_USUARIO',
    'db_pass' => 'SUA_SENHA',

    'asaas_base_url' => 'https://api-sandbox.asaas.com/v3',
    'asaas_api_key' => 'SUA_API_KEY_ASAAS',
    'asaas_webhook_token' => 'SEU_TOKEN_WEBHOOK_ASAAS',

    'pix_due_days' => 1,
];
