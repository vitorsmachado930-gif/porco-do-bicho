<?php
declare(strict_types=1);

function apiAllowedOrigins(): array
{
    return [
        'https://www.porcodobicho.com',
        'https://porcodobicho.com',
    ];
}

function apiClientIp(): string
{
    $cfIp = isset($_SERVER['HTTP_CF_CONNECTING_IP']) ? trim((string)$_SERVER['HTTP_CF_CONNECTING_IP']) : '';
    if ($cfIp !== '') {
        return $cfIp;
    }

    $forwarded = isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? trim((string)$_SERVER['HTTP_X_FORWARDED_FOR']) : '';
    if ($forwarded !== '') {
        $partes = explode(',', $forwarded);
        $primeiro = trim((string)($partes[0] ?? ''));
        if ($primeiro !== '') {
            return $primeiro;
        }
    }

    $remote = isset($_SERVER['REMOTE_ADDR']) ? trim((string)$_SERVER['REMOTE_ADDR']) : '';
    return $remote !== '' ? $remote : '0.0.0.0';
}

function apiOriginPermitida(string $origin): bool
{
    if ($origin === '') {
        return false;
    }

    if (preg_match('#^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$#i', $origin) === 1) {
        return true;
    }

    foreach (apiAllowedOrigins() as $permitida) {
        if (strcasecmp($origin, $permitida) === 0) {
            return true;
        }
    }

    return false;
}

function apiRefererPermitido(string $referer): bool
{
    if ($referer === '') {
        return false;
    }

    foreach (apiAllowedOrigins() as $base) {
        if (stripos($referer, $base . '/') === 0 || strcasecmp($referer, $base) === 0) {
            return true;
        }
    }

    return false;
}

function apiResolveCorsOrigin(): string
{
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string)$_SERVER['HTTP_ORIGIN']) : '';
    return apiOriginPermitida($origin) ? $origin : '';
}

function apiEnviarCabecalhosSeguranca(): void
{
    $originLiberada = apiResolveCorsOrigin();

    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
    header('Cross-Origin-Resource-Policy: same-site');
    header('Vary: Origin');

    if ($originLiberada !== '') {
        header('Access-Control-Allow-Origin: ' . $originLiberada);
        header('Access-Control-Allow-Credentials: true');
    }

    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Accept, X-Requested-With, X-App-Client');
}

function apiValidarClienteAplicacao(): bool
{
    $cliente = isset($_SERVER['HTTP_X_APP_CLIENT']) ? trim((string)$_SERVER['HTTP_X_APP_CLIENT']) : '';
    return hash_equals('porcodobicho-web', $cliente);
}

function apiValidarOrigemEscrita(): bool
{
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string)$_SERVER['HTTP_ORIGIN']) : '';
    $referer = isset($_SERVER['HTTP_REFERER']) ? trim((string)$_SERVER['HTTP_REFERER']) : '';

    if ($origin !== '') {
        return apiOriginPermitida($origin);
    }

    return apiRefererPermitido($referer);
}

function apiValidarRequisicaoAjax(): bool
{
    $requestedWith = isset($_SERVER['HTTP_X_REQUESTED_WITH'])
        ? trim((string)$_SERVER['HTTP_X_REQUESTED_WITH'])
        : '';

    return strcasecmp($requestedWith, 'XMLHttpRequest') === 0;
}

function apiAplicarRateLimit(string $escopo, int $maxRequisicoes, int $janelaSegundos): array
{
    $rootDir = dirname(__DIR__);
    $rateDir = $rootDir . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'rate_limits';
    if (!is_dir($rateDir) && !mkdir($rateDir, 0775, true) && !is_dir($rateDir)) {
        return ['ok' => true, 'remaining' => $maxRequisicoes];
    }

    $agora = time();
    $ip = apiClientIp();
    $hashIp = hash('sha256', $ip);
    $nomeArquivo = preg_replace('/[^a-z0-9_-]/i', '-', $escopo) . '-' . $hashIp . '.json';
    $caminho = $rateDir . DIRECTORY_SEPARATOR . $nomeArquivo;

    $contador = [
        'start' => $agora,
        'count' => 0,
    ];

    if (is_file($caminho)) {
        $conteudo = @file_get_contents($caminho);
        $lido = json_decode((string)$conteudo, true);
        if (is_array($lido) && isset($lido['start'], $lido['count'])) {
            $contador['start'] = (int)$lido['start'];
            $contador['count'] = (int)$lido['count'];
        }
    }

    if (($agora - $contador['start']) >= $janelaSegundos) {
        $contador['start'] = $agora;
        $contador['count'] = 0;
    }

    $contador['count']++;
    @file_put_contents($caminho, json_encode($contador, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    if ($contador['count'] > $maxRequisicoes) {
        return [
            'ok' => false,
            'retryAfter' => max(1, $janelaSegundos - ($agora - $contador['start'])),
            'remaining' => 0,
        ];
    }

    return [
        'ok' => true,
        'remaining' => max(0, $maxRequisicoes - $contador['count']),
    ];
}
