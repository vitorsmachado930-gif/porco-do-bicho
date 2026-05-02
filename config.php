<?php
// Ativa tipagem estrita para reduzir erros silenciosos.
declare(strict_types=1);

// Define timezone do projeto (Brasil).
date_default_timezone_set('America/Sao_Paulo');

/*
|--------------------------------------------------------------------------
| CONFIGURACAO DE BANCO (MySQL)
|--------------------------------------------------------------------------
| Troque pelos dados do seu banco na Hostinger.
*/
const DB_HOST = '127.0.0.1';
const DB_PORT = 3306;
const DB_NAME = 'SEU_BANCO';
const DB_USER = 'SEU_USUARIO';
const DB_PASS = 'SUA_SENHA';

/*
|--------------------------------------------------------------------------
| CONFIGURACAO ASAAS
|--------------------------------------------------------------------------
| IMPORTANTE: API Key fica SOMENTE no backend (aqui), nunca no frontend.
| Sandbox: https://api-sandbox.asaas.com/v3
| Producao: https://api.asaas.com/v3
*/
const ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';
const ASAAS_API_KEY = 'SUA_API_KEY_ASAAS';

/*
|--------------------------------------------------------------------------
| SEGURANCA DO WEBHOOK
|--------------------------------------------------------------------------
| Este token deve ser o mesmo configurado no painel do Asaas para webhook.
| Asaas envia no header: asaas-access-token
*/
const ASAAS_WEBHOOK_TOKEN = 'SEU_TOKEN_DO_WEBHOOK';

/*
|--------------------------------------------------------------------------
| CREDITO DE SALDO
|--------------------------------------------------------------------------
| Evento permitido para credito automatico.
*/
const EVENTO_CREDITO = 'PAYMENT_RECEIVED';

/*
|--------------------------------------------------------------------------
| FUNCOES UTILITARIAS
|--------------------------------------------------------------------------
*/

// Retorna conexao PDO unica (singleton simples).
function db(): PDO
{
    // Usa variavel estatica para evitar reconectar em cada chamada.
    static $pdo = null;

    // Se ja existe conexao, retorna ela.
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    // Monta DSN com charset utf8mb4.
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        DB_HOST,
        DB_PORT,
        DB_NAME
    );

    // Cria conexao PDO com modo de erro por excecao.
    $pdo = new PDO(
        $dsn,
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    // Retorna conexao pronta.
    return $pdo;
}

// Envia resposta JSON padrao e encerra script.
function jsonResponse(int $status, array $data): void
{
    // Define status HTTP.
    http_response_code($status);

    // Define tipo de conteudo JSON.
    header('Content-Type: application/json; charset=utf-8');

    // Evita cache em respostas sensiveis.
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    // Imprime JSON.
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    // Finaliza execucao.
    exit;
}

// Lê JSON do corpo da requisicao.
function getJsonBody(): array
{
    // Le o corpo bruto.
    $raw = file_get_contents('php://input');

    // Se nao veio nada, retorna array vazio.
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }

    // Decodifica JSON para array associativo.
    $data = json_decode($raw, true);

    // Se JSON invalido, retorna erro 400.
    if (!is_array($data)) {
        jsonResponse(400, ['ok' => false, 'error' => 'JSON invalido.']);
    }

    // Retorna payload.
    return $data;
}

// Normaliza login (minusculo e sem espaco).
function normalizeLogin(string $login): string
{
    // Remove espacos e coloca minusculo.
    return strtolower(preg_replace('/\s+/', '', trim($login)) ?? '');
}

// Mantem somente digitos.
function onlyDigits(string $value): string
{
    // Remove tudo que nao e numero.
    return preg_replace('/\D+/', '', $value) ?? '';
}

// Normaliza valor monetario para float com 2 casas.
function normalizeAmount(mixed $value): float
{
    // Se vier string, tenta tratar formato BR.
    if (is_string($value)) {
        $tmp = str_replace(['R$', ' ', '.'], '', $value);
        $tmp = str_replace(',', '.', $tmp);
        $number = (float)$tmp;
    } else {
        // Se vier numero, converte direto.
        $number = (float)$value;
    }

    // Valor invalido ou menor/igual zero vira zero.
    if (!is_finite($number) || $number <= 0) {
        return 0.0;
    }

    // Retorna com 2 casas.
    return (float)number_format($number, 2, '.', '');
}

// Faz chamada HTTP para API oficial do Asaas.
function asaasRequest(string $method, string $path, ?array $body = null, array $query = []): array
{
    // Monta URL base + path.
    $url = rtrim(ASAAS_BASE_URL, '/') . '/' . ltrim($path, '/');

    // Se houver query string, adiciona na URL.
    if (!empty($query)) {
        $url .= '?' . http_build_query($query);
    }

    // Inicia cURL.
    $ch = curl_init($url);

    // Se falhar ao iniciar cURL, dispara excecao.
    if ($ch === false) {
        throw new RuntimeException('Falha ao iniciar cURL.');
    }

    // Define headers exigidos pelo Asaas.
    $headers = [
        'accept: application/json',
        'content-type: application/json',
        'access_token: ' . ASAAS_API_KEY,
        'user-agent: porcodobicho-asaas/1.0',
    ];

    // Converte metodo para caixa alta.
    $method = strtoupper($method);

    // Define payload JSON se houver body.
    $payload = null;
    if ($body !== null) {
        $payload = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($payload === false) {
            throw new RuntimeException('Falha ao converter body para JSON.');
        }
    }

    // Configura opcoes da requisicao.
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);

    // Se tiver payload, envia no corpo.
    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    }

    // Executa requisicao.
    $respBody = curl_exec($ch);

    // Le status HTTP da resposta.
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

    // Le erro de rede do cURL.
    $curlErr = curl_error($ch);

    // Fecha cURL.
    curl_close($ch);

    // Se falhou de rede, dispara excecao.
    if ($respBody === false) {
        throw new RuntimeException('Erro de comunicacao com Asaas: ' . $curlErr);
    }

    // Tenta decodificar JSON de retorno.
    $decoded = json_decode((string)$respBody, true);

    // Se nao for JSON valido, embrulha como raw.
    if (!is_array($decoded)) {
        $decoded = ['raw' => (string)$respBody];
    }

    // Retorna status + body.
    return [
        'status' => $status,
        'body' => $decoded,
    ];
}

// Busca usuario por ID no banco local.
function findUserById(PDO $pdo, int $userId): ?array
{
    // Prepara query segura.
    $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1');

    // Executa com parametro.
    $stmt->execute([':id' => $userId]);

    // Le uma linha.
    $row = $stmt->fetch();

    // Retorna null se nao encontrou.
    return $row ?: null;
}

// Busca ou cria cliente Asaas e salva asaas_customer_id na tabela usuarios.
function getOrCreateAsaasCustomer(PDO $pdo, int $userId): string
{
    // Busca usuario local.
    $user = findUserById($pdo, $userId);

    // Se nao existe, retorna erro.
    if (!$user) {
        throw new RuntimeException('Usuario nao encontrado.');
    }

    // Se ja possui customer do Asaas, retorna direto.
    $existingCustomerId = trim((string)($user['asaas_customer_id'] ?? ''));
    if ($existingCustomerId !== '') {
        return $existingCustomerId;
    }

    // Monta externalReference unico para cliente.
    $customerRef = 'usuario_' . $userId;

    // Tenta localizar cliente existente no Asaas por externalReference.
    $search = asaasRequest('GET', '/customers', null, [
        'externalReference' => $customerRef,
        'limit' => 1,
        'offset' => 0,
    ]);

    // Se buscou com sucesso e retornou cliente, reaproveita.
    if ($search['status'] >= 200 && $search['status'] < 300) {
        $data = $search['body']['data'] ?? [];
        if (is_array($data) && isset($data[0]['id'])) {
            $customerId = (string)$data[0]['id'];

            // Salva customer no banco local.
            $up = $pdo->prepare('UPDATE usuarios SET asaas_customer_id = :cid, updated_at = NOW() WHERE id = :id');
            $up->execute([':cid' => $customerId, ':id' => $userId]);

            // Retorna id encontrado.
            return $customerId;
        }
    }

    // Prepara CPF/CNPJ somente com digitos.
    $cpfCnpj = onlyDigits((string)($user['cpf_cnpj'] ?? ''));

    // Asaas exige CPF/CNPJ para criar cliente.
    if ($cpfCnpj === '' || (strlen($cpfCnpj) !== 11 && strlen($cpfCnpj) !== 14)) {
        throw new RuntimeException('CPF/CNPJ do usuario ausente ou invalido.');
    }

    // Prepara telefone apenas digitos (opcional no Asaas, mas ajuda).
    $phone = onlyDigits((string)($user['telefone'] ?? ''));

    // Cria cliente no Asaas.
    $create = asaasRequest('POST', '/customers', [
        'name' => (string)$user['nome'],
        'cpfCnpj' => $cpfCnpj,
        'email' => (string)($user['email'] ?? ''),
        'phone' => $phone,
        'externalReference' => $customerRef,
        'notificationDisabled' => true,
    ]);

    // Se falhou, retorna erro com body do provedor.
    if ($create['status'] < 200 || $create['status'] >= 300) {
        throw new RuntimeException('Falha ao criar cliente no Asaas.');
    }

    // Extrai id do cliente criado.
    $customerId = (string)($create['body']['id'] ?? '');

    // Garante que veio id.
    if ($customerId === '') {
        throw new RuntimeException('Asaas nao retornou customer id.');
    }

    // Salva customer id na base local.
    $up = $pdo->prepare('UPDATE usuarios SET asaas_customer_id = :cid, updated_at = NOW() WHERE id = :id');
    $up->execute([':cid' => $customerId, ':id' => $userId]);

    // Retorna customer id.
    return $customerId;
}

// Le header de webhook de forma compativel.
function getWebhookTokenFromHeader(): string
{
    // Header oficial do Asaas para token do webhook.
    $token = $_SERVER['HTTP_ASAAS_ACCESS_TOKEN'] ?? '';

    // Retorna token normalizado.
    return trim((string)$token);
}
