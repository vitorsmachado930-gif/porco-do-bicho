<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method !== 'GET') {
    jsonResponse(405, [
        'ok' => false,
        'error' => 'Método não permitido. Use GET.',
    ]);
}

/**
 * Lê as últimas linhas úteis do log JSONL.
 *
 * @return array<int, array<string, mixed>>
 */
function lerEventosSaudeDoLog(string $arquivoLog, int $limiteLinhas = 500): array
{
    if (!is_file($arquivoLog) || !is_readable($arquivoLog)) {
        return [];
    }

    $linhas = @file($arquivoLog, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($linhas) || empty($linhas)) {
        return [];
    }

    if (count($linhas) > $limiteLinhas) {
        $linhas = array_slice($linhas, -$limiteLinhas);
    }

    $eventos = [];
    foreach ($linhas as $linha) {
        $dec = json_decode((string)$linha, true);
        if (is_array($dec)) {
            $eventos[] = $dec;
        }
    }

    return $eventos;
}

try {
    $pdo = db();
    ensureWalletSchemaSafely($pdo);

    $hoje = date('Y-m-d');
    $stmt = $pdo->prepare(
        "SELECT
            COUNT(*) AS total_depositos,
            COALESCE(SUM(valor), 0) AS valor_depositos
         FROM depositos
         WHERE status = 'PAGO'
           AND DATE(COALESCE(pago_em, atualizado_em, criado_em)) = :hoje"
    );
    $stmt->execute([':hoje' => $hoje]);
    $linhaDepositos = $stmt->fetch() ?: [];

    $eventosLog = lerEventosSaudeDoLog(ASAAS_LOG_FILE, 800);
    $ultimoWebhookRecebidoEm = null;
    $ultimoCreditoConfirmadoEm = null;
    $ultimoErroWebhook = null;

    for ($i = count($eventosLog) - 1; $i >= 0; $i--) {
        $evento = $eventosLog[$i];
        $titulo = strtolower(trim((string)($evento['title'] ?? '')));
        $quando = trim((string)($evento['when'] ?? ''));
        $contexto = isset($evento['context']) && is_array($evento['context']) ? $evento['context'] : [];

        if ($ultimoWebhookRecebidoEm === null && $titulo === 'webhook_recebido' && $quando !== '') {
            $ultimoWebhookRecebidoEm = $quando;
        }

        if ($ultimoCreditoConfirmadoEm === null && $titulo === 'webhook_credito_ok' && $quando !== '') {
            $ultimoCreditoConfirmadoEm = $quando;
        }

        if ($ultimoErroWebhook === null && $titulo === 'webhook_erro') {
            $ultimoErroWebhook = trim((string)($contexto['message'] ?? $contexto['reason'] ?? ''));
        }

        if ($ultimoWebhookRecebidoEm !== null && $ultimoCreditoConfirmadoEm !== null && $ultimoErroWebhook !== null) {
            break;
        }
    }

    jsonResponse(200, [
        'ok' => true,
        'saude' => [
            'data_referencia' => $hoje,
            'ultimo_webhook_recebido_em' => $ultimoWebhookRecebidoEm,
            'ultimo_credito_confirmado_em' => $ultimoCreditoConfirmadoEm,
            'ultimo_erro_webhook' => $ultimoErroWebhook,
            'total_depositos_hoje' => (int)($linhaDepositos['total_depositos'] ?? 0),
            'valor_depositos_hoje' => (float)($linhaDepositos['valor_depositos'] ?? 0),
        ],
    ]);
} catch (Throwable $e) {
    appendAsaasLog('admin_saude_erro', [
        'message' => $e->getMessage(),
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Falha ao carregar saúde do painel admin.',
    ]);
}

