<?php
// Ativa tipagem estrita.
declare(strict_types=1);

// Carrega configuracao e funcoes comuns.
require_once __DIR__ . '/config.php';

// Permite preflight CORS simples (opcional para frontend no mesmo dominio).
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    // Informa metodos permitidos.
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    // Informa headers permitidos.
    header('Access-Control-Allow-Headers: Content-Type');
    // Responde sem conteudo.
    http_response_code(204);
    // Encerra.
    exit;
}

// Garante que apenas POST seja aceito.
if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    jsonResponse(405, ['ok' => false, 'error' => 'Metodo nao permitido. Use POST.']);
}

try {
    // Le body JSON.
    $body = getJsonBody();

    // Pega id do usuario.
    $userId = (int)($body['user_id'] ?? 0);

    // Valida id.
    if ($userId <= 0) {
        jsonResponse(422, ['ok' => false, 'error' => 'user_id invalido.']);
    }

    // Abre conexao.
    $pdo = db();

    // Busca/cria customer no Asaas e salva no usuario.
    $customerId = getOrCreateAsaasCustomer($pdo, $userId);

    // Retorna sucesso.
    jsonResponse(200, [
        'ok' => true,
        'user_id' => $userId,
        'asaas_customer_id' => $customerId,
    ]);
} catch (Throwable $e) {
    // Retorna erro interno com mensagem controlada.
    jsonResponse(500, [
        'ok' => false,
        'error' => 'Falha ao criar/buscar cliente Asaas.',
        'detail' => $e->getMessage(),
    ]);
}
