<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'security.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_config.php';

apiEnviarCabecalhosSeguranca();

function walletResponder(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function walletMetodo(): string
{
    return strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
}

function walletTratarPreflight(): void
{
    if (walletMetodo() === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function walletValidarMetodo(string $esperado): void
{
    if (walletMetodo() !== strtoupper($esperado)) {
        walletResponder(405, ['ok' => false, 'error' => 'Metodo nao permitido.']);
    }
}

function walletValidarClienteWeb(): void
{
    if (!apiValidarClienteAplicacao() && (!apiValidarOrigemEscrita() || !apiValidarRequisicaoAjax())) {
        walletResponder(403, ['ok' => false, 'error' => 'Cliente nao autorizado.']);
    }
}

function walletAplicarRateLimit(string $escopo, int $maxReq = 60, int $janelaSeg = 60): void
{
    $rate = apiAplicarRateLimit($escopo, $maxReq, $janelaSeg);
    if (!($rate['ok'] ?? false)) {
        header('Retry-After: ' . (string)($rate['retryAfter'] ?? 60));
        walletResponder(429, ['ok' => false, 'error' => 'Muitas requisicoes.']);
    }
}

function walletBodyJson(int $maxBytes = 1024 * 1024): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        walletResponder(400, ['ok' => false, 'error' => 'Payload vazio.']);
    }
    if (strlen($raw) > $maxBytes) {
        walletResponder(413, ['ok' => false, 'error' => 'Payload muito grande.']);
    }
    $json = json_decode($raw, true);
    if (!is_array($json)) {
        walletResponder(400, ['ok' => false, 'error' => 'JSON invalido.']);
    }
    return $json;
}

function walletNormalizarLogin($login): string
{
    return strtolower(preg_replace('/\s+/', '', trim((string)$login)) ?? '');
}

function walletValidarSenhaTexto($senha): string
{
    return trim((string)$senha);
}

function walletDigitos(string $valor): string
{
    return preg_replace('/\D+/', '', $valor) ?? '';
}

function walletNormalizarCpfCnpj(?string $valor): string
{
    $digitos = walletDigitos((string)$valor);
    if ($digitos === '') return '';
    if (strlen($digitos) !== 11 && strlen($digitos) !== 14) {
        return '';
    }
    return $digitos;
}

function walletNormalizarValor($valor): float
{
    if (is_string($valor)) {
        $limpo = str_replace(['R$', ' ', '.'], '', $valor);
        $limpo = str_replace(',', '.', $limpo);
        $n = (float)$limpo;
    } else {
        $n = (float)$valor;
    }

    if (!is_finite($n) || $n <= 0) {
        return 0.0;
    }

    return (float)number_format($n, 2, '.', '');
}

function walletAsaasHeaders(): array
{
    $cfg = walletConfig();
    if ($cfg['asaas_api_key'] === '') {
        throw new RuntimeException('ASAAS_API_KEY nao configurada.');
    }

    return [
        'accept: application/json',
        'content-type: application/json',
        'access_token: ' . $cfg['asaas_api_key'],
        'user-agent: porcodobicho-wallet/1.0',
    ];
}

function walletAsaasRequest(string $method, string $path, ?array $body = null, array $query = []): array
{
    $cfg = walletConfig();
    $base = rtrim((string)$cfg['asaas_base_url'], '/');
    $pathFmt = '/' . ltrim($path, '/');
    $url = $base . $pathFmt;

    if (!empty($query)) {
        $url .= '?' . http_build_query($query);
    }

    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('Falha ao iniciar cURL.');
    }

    $headers = walletAsaasHeaders();
    $methodUp = strtoupper($method);
    $payload = null;

    if ($body !== null) {
        $payload = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($payload === false) {
            throw new RuntimeException('Falha ao montar payload JSON para Asaas.');
        }
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $methodUp,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);

    if ($payload !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    }

    $respBody = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($respBody === false) {
        throw new RuntimeException('Falha de comunicacao com Asaas: ' . $curlErr);
    }

    $decoded = json_decode((string)$respBody, true);
    if (!is_array($decoded)) {
        $decoded = ['raw' => (string)$respBody];
    }

    return [
        'status' => $httpCode,
        'body' => $decoded,
    ];
}

function walletAsaasResolveHeader(string $nome): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $nome));
    $valor = $_SERVER[$key] ?? '';
    return trim((string)$valor);
}

function walletSenhaHashValido($hash): bool
{
    $texto = trim((string)$hash);
    return $texto !== '' && strlen($texto) >= 40;
}

function walletSenhaConfere(string $senhaInformada, $hash): bool
{
    $hashTexto = trim((string)$hash);
    if ($hashTexto === '' || $senhaInformada === '') {
        return false;
    }
    return password_verify($senhaInformada, $hashTexto);
}
