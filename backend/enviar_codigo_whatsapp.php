<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if ($method !== 'POST') {
    jsonResponse(405, ['ok' => false, 'error' => 'Método não permitido. Use POST.']);
}

try {
    if (!whatsappVerificationEnabled()) {
        jsonResponse(200, [
            'ok' => true,
            'message' => 'Verificação por WhatsApp está desativada neste ambiente.',
            'whatsapp_verification_required' => false,
        ]);
    }

    try {
        require_once __DIR__ . '/validar_codigo_core.php';
    } catch (Throwable $e) {
        appendAsaasLog('whatsapp_codigo_erro', [
            'erro_include_core' => $e->getMessage(),
        ]);
        jsonResponse(500, [
            'ok' => false,
            'error' => 'Falha interna ao carregar envio de código WhatsApp.',
        ]);
    }

    $body = getJsonBody();

    // Compatível com frontend atual (usuario_id) e novo nome (cadastro_temp_id).
    $tempId = (int)($body['cadastro_temp_id'] ?? $body['usuario_id'] ?? 0);

    appendAsaasLog('whatsapp_reenvio_tentativa', [
        'cadastro_temp_id' => $tempId,
    ]);

    if ($tempId <= 0) {
        jsonResponse(422, [
            'ok' => false,
            'error' => 'Cadastro pendente inválido para reenvio.',
        ]);
    }

    $pdo = db();
    ensureWalletSchemaSafely($pdo);
    usuariosTempCleanup($pdo);

    $tabelaPendentes = getPendingUsersTable($pdo);
    $temp = usuariosTempGetRowById($pdo, $tempId);
    if (!is_array($temp) || (int)($temp['verificado'] ?? 0) === 1) {
        jsonResponse(404, [
            'ok' => false,
            'error' => 'Cadastro pendente não encontrado ou já confirmado.',
        ]);
    }

    $whatsapp = normalizeWhatsapp((string)($temp['whatsapp'] ?? ''));
    if ($whatsapp === '' || strlen($whatsapp) < 10) {
        jsonResponse(422, [
            'ok' => false,
            'error' => 'WhatsApp inválido no cadastro pendente.',
        ]);
    }

    // Limite simples de segurança por registro pendente.
    $tentativas = (int)($temp['tentativas'] ?? 0);
    if ($tentativas >= 10) {
        jsonResponse(429, [
            'ok' => false,
            'error' => 'Muitas tentativas neste cadastro. Crie um novo cadastro após alguns minutos.',
        ]);
    }

    $codigo = usuariosTempCodigoAleatorio(6);

    $enviado = sendWhatsappCode($whatsapp, $codigo);
    if (!$enviado) {
        appendAsaasLog('whatsapp_codigo_erro', [
            'cadastro_temp_id' => $tempId,
            'whatsapp' => $whatsapp,
        ]);

        jsonResponse(502, [
            'ok' => false,
            'error' => 'Falha ao enviar código no WhatsApp. Verifique a configuração do provedor.',
        ]);
    }

    $up = $pdo->prepare(
        "UPDATE {$tabelaPendentes}
         SET codigo_verificacao = :codigo,
             expira_em = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
             tentativas = tentativas + 1,
             atualizado_em = NOW()
         WHERE id = :id
           AND verificado = 0
         LIMIT 1"
    );
    $up->execute([
        ':codigo' => $codigo,
        ':id' => $tempId,
    ]);

    appendAsaasLog('whatsapp_codigo_enviado', [
        'cadastro_temp_id' => $tempId,
        'whatsapp' => $whatsapp,
    ]);

    jsonResponse(200, [
        'ok' => true,
        'message' => 'Código reenviado no WhatsApp com sucesso. Ele expira em 5 minutos.',
        'cadastro_temp_id' => $tempId,
        'expira_em_minutos' => 5,
    ]);
} catch (Throwable $e) {
    appendAsaasLog('whatsapp_reenvio_exception', [
        'message' => $e->getMessage(),
        'code' => (string)$e->getCode(),
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Erro interno ao reenviar código.',
    ]);
}
