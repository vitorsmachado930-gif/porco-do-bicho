<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

// Endpoint temporário para teste direto do envio WhatsApp.
// Use apenas para diagnóstico e remova depois.

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'GET') {
    jsonResponse(405, [
        'ok' => false,
        'error' => 'Método não permitido.',
    ]);
}

$tokenRecebido = trim((string)($_GET['token'] ?? ''));
$tokenEsperado = trim(envOrDefault('RESET_ADMIN_TOKEN', '1965917'));
if ($tokenRecebido === '' || !hash_equals($tokenEsperado, $tokenRecebido)) {
    jsonResponse(403, [
        'ok' => false,
        'error' => 'Token inválido.',
    ]);
}

$numero = normalizeWhatsapp((string)($_GET['numero'] ?? ''));
if ($numero === '') {
    $numero = '17991609061';
}

$codigo = trim((string)($_GET['codigo'] ?? '123456'));
if ($codigo === '') {
    $codigo = '123456';
}

appendAsaasLog('whatsapp_teste_inicio', [
    'numero' => $numero,
    'codigo' => $codigo,
]);

try {
    $ok = sendWhatsappCode($numero, $codigo);
    appendAsaasLog('whatsapp_teste_fim', [
        'numero' => $numero,
        'resultado' => $ok ? 'ok' : 'falha',
    ]);

    jsonResponse(200, [
        'ok' => $ok,
        'numero' => $numero,
        'codigo' => $codigo,
        'message' => $ok
            ? 'Teste enviado com sucesso.'
            : 'Falha no teste. Consulte debug_whatsapp_log.php.',
    ]);
} catch (Throwable $e) {
    appendAsaasLog('whatsapp_teste_exception', [
        'numero' => $numero,
        'message' => $e->getMessage(),
        'code' => (string)$e->getCode(),
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Exceção no teste de envio.',
        'debug' => $e->getMessage(),
    ]);
}

