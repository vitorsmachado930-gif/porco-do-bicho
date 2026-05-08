<?php
// Painel administrativo completo (dados + ações).
declare(strict_types=1);

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Admin-Password');
    http_response_code(204);
    exit;
}

function adminResponse(int $status, array $payload): void
{
    jsonResponse($status, $payload);
}

function adminReadJsonInput(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }

    $dec = json_decode($raw, true);
    if (!is_array($dec)) {
        return [];
    }

    return $dec;
}

function adminHeaderValue(string $name): string
{
    $target = strtoupper(str_replace('-', '_', $name));
    $candidates = [
        'HTTP_' . $target,
        $target,
    ];

    foreach ($candidates as $key) {
        if (isset($_SERVER[$key])) {
            return trim((string)$_SERVER[$key]);
        }
    }

    return '';
}

function adminGetPasswordFromRequest(array $body): string
{
    $candidates = [
        adminHeaderValue('X-Admin-Password'),
        trim((string)($_GET['admin_password'] ?? '')),
        trim((string)($body['admin_password'] ?? '')),
    ];

    foreach ($candidates as $value) {
        if ($value !== '') {
            return $value;
        }
    }

    return '';
}

function adminAuthOrFail(array $body): void
{
    $expected = envOrDefault('ADMIN_PANEL_PASSWORD', '1965917');
    $received = adminGetPasswordFromRequest($body);

    if ($received === '' || !hash_equals($expected, $received)) {
        adminResponse(401, [
            'ok' => false,
            'error' => 'Não autorizado no painel admin.',
        ]);
    }
}

function adminStoragePath(string $file): string
{
    return dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . $file;
}

function adminEnsureSchemaCached(PDO $pdo, int $ttlSeconds = 600): void
{
    $cachePath = adminStoragePath('admin_schema_check_cache.json');
    $now = time();

    if (is_file($cachePath)) {
        $raw = @file_get_contents($cachePath);
        if (is_string($raw) && trim($raw) !== '') {
            $dec = json_decode($raw, true);
            if (is_array($dec)) {
                $last = (int)($dec['last_check'] ?? 0);
                if ($last > 0 && ($now - $last) < $ttlSeconds) {
                    return;
                }
            }
        }
    }

    ensureWalletSchemaSafely($pdo);

    @file_put_contents(
        $cachePath,
        json_encode(['last_check' => $now], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    );
}

function adminLoadJsonFile(string $path, array $fallback = []): array
{
    if (!is_file($path) || !is_readable($path)) {
        return $fallback;
    }

    $raw = @file_get_contents($path);
    if (!is_string($raw) || trim($raw) === '') {
        return $fallback;
    }

    $dec = json_decode($raw, true);
    if (!is_array($dec)) {
        return $fallback;
    }

    return $dec;
}

function adminNormalizeDate(?string $value): string
{
    $txt = trim((string)$value);
    if ($txt === '') {
        return '';
    }

    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $txt)) {
        return $txt;
    }

    $ts = strtotime($txt);
    if ($ts === false) {
        return '';
    }

    return date('Y-m-d', $ts);
}

function adminDateRangeFromQuery(): array
{
    $mode = strtolower(trim((string)($_GET['modo'] ?? 'hoje')));
    $hoje = date('Y-m-d');
    $inicio = adminNormalizeDate((string)($_GET['inicio'] ?? ''));
    $fim = adminNormalizeDate((string)($_GET['fim'] ?? ''));

    if ($mode !== 'intervalo') {
        return [$hoje, $hoje, 'hoje'];
    }

    if ($inicio === '' || $fim === '') {
        return [$hoje, $hoje, 'hoje'];
    }

    if ($inicio > $fim) {
        [$inicio, $fim] = [$fim, $inicio];
    }

    return [$inicio, $fim, 'intervalo'];
}

function adminInDateRange(string $dateIso, string $inicio, string $fim): bool
{
    if ($dateIso === '') {
        return false;
    }
    return $dateIso >= $inicio && $dateIso <= $fim;
}

function adminApostaDate(array $aposta): string
{
    $date = adminNormalizeDate((string)($aposta['data'] ?? ''));
    if ($date !== '') {
        return $date;
    }

    $created = trim((string)($aposta['createdAt'] ?? $aposta['criadoEm'] ?? ''));
    if ($created === '') {
        return '';
    }

    return adminNormalizeDate(substr($created, 0, 10));
}

function adminToFloat($value): float
{
    if (is_string($value)) {
        $tmp = str_replace(['R$', ' ', '.'], '', $value);
        $tmp = str_replace(',', '.', $tmp);
        $n = (float)$tmp;
    } else {
        $n = (float)$value;
    }

    if (!is_finite($n)) {
        return 0.0;
    }

    return (float)number_format($n, 2, '.', '');
}

function adminNormalizeOptionalCpf(?string $value): ?string
{
    $cpf = normalizeCpf11((string)$value);
    return $cpf === '' ? null : $cpf;
}

function adminNormalizeOptionalWhatsapp(?string $value): ?string
{
    $w = normalizeWhatsapp((string)$value);
    return $w === '' ? null : $w;
}

function adminApostaValor(array $aposta): float
{
    $keys = ['valorTotal', 'valor', 'valorAposta', 'valorBilhete'];
    foreach ($keys as $k) {
        if (array_key_exists($k, $aposta)) {
            $v = adminToFloat($aposta[$k]);
            if ($v > 0) {
                return $v;
            }
        }
    }
    return 0.0;
}

function adminApostaPremio(array $aposta): float
{
    $keys = ['retorno', 'premioTotal', 'ganhoTotal', 'premio'];
    foreach ($keys as $k) {
        if (array_key_exists($k, $aposta)) {
            $v = adminToFloat($aposta[$k]);
            if ($v > 0) {
                return $v;
            }
        }
    }
    return 0.0;
}

function adminApostaStatus(array $aposta): string
{
    $status = strtolower(trim((string)($aposta['status'] ?? '')));
    if ($status !== '') {
        return $status;
    }

    if (adminApostaPremio($aposta) > 0) {
        return 'premiada';
    }

    return 'aberta';
}

function adminUserDisplay(array $u): string
{
    $nome = trim((string)($u['nome'] ?? ''));
    $login = trim((string)($u['login'] ?? ''));
    if ($nome !== '') {
        return $nome;
    }
    if ($login !== '') {
        return '@' . $login;
    }
    return 'Usuário #' . (int)($u['id'] ?? 0);
}

function adminTableExists(PDO $pdo, string $table): bool
{
    try {
        $sql = 'SELECT COUNT(*) AS total
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = :table';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':table' => $table]);
        $row = $stmt->fetch();
        return (int)($row['total'] ?? 0) > 0;
    } catch (Throwable $_e) {
        return false;
    }
}

function adminColumnExists(PDO $pdo, string $table, string $column): bool
{
    try {
        $sql = 'SELECT COUNT(*) AS total
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = :table
                  AND COLUMN_NAME = :column';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':table' => $table,
            ':column' => $column,
        ]);
        $row = $stmt->fetch();
        return (int)($row['total'] ?? 0) > 0;
    } catch (Throwable $_e) {
        return false;
    }
}

function adminGetPainelData(): array
{
    $painel = adminLoadJsonFile(adminStoragePath('painel_sync.json'), [
        'updatedAt' => 0,
        'usuarios' => [],
        'apostas' => [],
    ]);

    return [
        'updatedAt' => (int)($painel['updatedAt'] ?? 0),
        'usuarios' => is_array($painel['usuarios'] ?? null) ? $painel['usuarios'] : [],
        'apostas' => is_array($painel['apostas'] ?? null) ? $painel['apostas'] : [],
    ];
}

function adminGetResultadosData(): array
{
    $res = adminLoadJsonFile(adminStoragePath('resultados_sync.json'), [
        'updatedAt' => 0,
        'dados' => [],
    ]);

    return [
        'updatedAt' => (int)($res['updatedAt'] ?? 0),
        'dados' => is_array($res['dados'] ?? null) ? $res['dados'] : [],
    ];
}

function adminAudit(PDO $pdo, string $acao, string $entidade, string $entidadeId, $valorAntigo, $valorNovo, string $justificativa = '', ?int $adminId = null, string $adminLogin = 'admin'): void
{
    try {
        $stmt = $pdo->prepare(
            'INSERT INTO auditoria_admin (
                admin_id, admin_login, acao, entidade, entidade_id,
                valor_antigo, valor_novo, justificativa, ip, user_agent, criado_em
            ) VALUES (
                :admin_id, :admin_login, :acao, :entidade, :entidade_id,
                :valor_antigo, :valor_novo, :justificativa, :ip, :ua, NOW()
            )'
        );
        $stmt->execute([
            ':admin_id' => $adminId,
            ':admin_login' => $adminLogin,
            ':acao' => $acao,
            ':entidade' => $entidade,
            ':entidade_id' => $entidadeId,
            ':valor_antigo' => is_string($valorAntigo) ? $valorAntigo : json_encode($valorAntigo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':valor_novo' => is_string($valorNovo) ? $valorNovo : json_encode($valorNovo, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':justificativa' => $justificativa,
            ':ip' => trim((string)($_SERVER['REMOTE_ADDR'] ?? '')),
            ':ua' => substr(trim((string)($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 255),
        ]);
    } catch (Throwable $e) {
        appendAsaasLog('admin_audit_erro', [
            'acao' => $acao,
            'entidade' => $entidade,
            'erro' => $e->getMessage(),
        ]);
    }
}

function adminIsProtectedAccount(array $usuario): bool
{
    $login = strtolower(trim((string)($usuario['login'] ?? '')));
    $perfil = strtolower(trim((string)($usuario['perfil'] ?? '')));
    return $login === 'admin' || $perfil === 'admin';
}

function adminCancelarComissoesPendentesPromotor(PDO $pdo, int $promotorId, int $apostadorId, string $obs): int
{
    if ($promotorId <= 0 || $apostadorId <= 0) {
        return 0;
    }

    $stmt = $pdo->prepare(
        "UPDATE comissoes
         SET status = 'cancelada',
             observacao = :obs,
             atualizado_em = NOW()
         WHERE promotor_usuario_id = :promotor_id
           AND apostador_usuario_id = :apostador_id
           AND status = 'pendente'"
    );
    $stmt->execute([
        ':obs' => $obs,
        ':promotor_id' => $promotorId,
        ':apostador_id' => $apostadorId,
    ]);

    return (int)$stmt->rowCount();
}

function adminSyncPendingDeposit(PDO $pdo, array $deposito): array
{
    $depositoId = (int)($deposito['id'] ?? 0);
    $statusLocal = strtoupper(trim((string)($deposito['status'] ?? 'PENDENTE')));
    $paymentId = trim((string)($deposito['asaas_payment_id'] ?? ''));

    if ($depositoId <= 0 || $paymentId === '') {
        return [
            'ok' => false,
            'deposito_id' => $depositoId,
            'error' => 'Depósito sem asaas_payment_id.',
        ];
    }

    if ($statusLocal === 'PAGO') {
        return [
            'ok' => true,
            'deposito_id' => $depositoId,
            'status_local' => 'PAGO',
            'status_asaas' => 'RECEIVED',
            'creditado' => true,
            'message' => 'Depósito já estava pago.',
        ];
    }

    $resp = asaasRequest('GET', '/payments/' . rawurlencode($paymentId));
    if ($resp['status'] < 200 || $resp['status'] >= 300) {
        return [
            'ok' => false,
            'deposito_id' => $depositoId,
            'error' => 'Falha ao consultar Asaas.',
            'http_status' => $resp['status'],
            'provider' => $resp['body'],
        ];
    }

    $providerStatus = strtoupper(trim((string)($resp['body']['status'] ?? '')));
    $map = [
        'RECEIVED' => 'PAGO',
        'CONFIRMED' => 'PAGO',
        'PENDING' => 'PENDENTE',
        'OVERDUE' => 'EXPIRADO',
        'REFUNDED' => 'CANCELADO',
        'RECEIVED_IN_CASH' => 'PAGO',
        'RECEIVED_BY_BANK_SLIP' => 'PAGO',
    ];
    $newStatus = $map[$providerStatus] ?? $statusLocal;

    $pdo->beginTransaction();

    $lock = $pdo->prepare('SELECT * FROM depositos WHERE id = :id LIMIT 1 FOR UPDATE');
    $lock->execute([':id' => $depositoId]);
    $atual = $lock->fetch();

    if (!$atual) {
        $pdo->rollBack();
        return [
            'ok' => false,
            'deposito_id' => $depositoId,
            'error' => 'Depósito não encontrado após lock.',
        ];
    }

    $statusAtual = strtoupper(trim((string)($atual['status'] ?? 'PENDENTE')));
    $creditado = false;

    if ($statusAtual !== 'PAGO' && $newStatus === 'PAGO') {
        $valor = adminToFloat($atual['valor'] ?? 0);
        $usuarioId = (int)($atual['usuario_id'] ?? 0);

        $saldoStmt = $pdo->prepare('SELECT saldo FROM usuarios WHERE id = :id LIMIT 1 FOR UPDATE');
        $saldoStmt->execute([':id' => $usuarioId]);
        $rowSaldo = $saldoStmt->fetch();
        if (!$rowSaldo) {
            $pdo->rollBack();
            return [
                'ok' => false,
                'deposito_id' => $depositoId,
                'error' => 'Usuário do depósito não encontrado.',
            ];
        }

        $saldoAntes = adminToFloat($rowSaldo['saldo'] ?? 0);
        $saldoDepois = (float)number_format($saldoAntes + $valor, 2, '.', '');

        $upSaldo = $pdo->prepare('UPDATE usuarios SET saldo = :saldo WHERE id = :id LIMIT 1');
        $upSaldo->execute([
            ':saldo' => $saldoDepois,
            ':id' => $usuarioId,
        ]);

        $mov = $pdo->prepare(
            'INSERT INTO movimentacoes_saldo (
                usuario_id, tipo, valor, saldo_antes, saldo_depois,
                referencia_tipo, referencia_id, motivo, admin_responsavel_id, criado_em
            ) VALUES (
                :usuario_id, :tipo, :valor, :saldo_antes, :saldo_depois,
                :referencia_tipo, :referencia_id, :motivo, NULL, NOW()
            )'
        );
        $mov->execute([
            ':usuario_id' => $usuarioId,
            ':tipo' => 'deposito_pix',
            ':valor' => $valor,
            ':saldo_antes' => $saldoAntes,
            ':saldo_depois' => $saldoDepois,
            ':referencia_tipo' => 'deposito',
            ':referencia_id' => (string)$depositoId,
            ':motivo' => 'Crédito automático via sincronização manual Asaas.',
        ]);

        $creditado = true;
    }

        $upDep = $pdo->prepare(
            "UPDATE depositos
         SET status = :status,
             pago_em = CASE WHEN :status = 'PAGO' AND pago_em IS NULL THEN NOW() ELSE pago_em END,
             atualizado_em = NOW()
         WHERE id = :id
         LIMIT 1"
        );
    $upDep->execute([
        ':status' => $newStatus,
        ':id' => $depositoId,
    ]);

    $pdo->commit();

    return [
        'ok' => true,
        'deposito_id' => $depositoId,
        'status_local_anterior' => $statusAtual,
        'status_local' => $newStatus,
        'status_asaas' => $providerStatus,
        'creditado' => $creditado,
    ];
}

$body = adminReadJsonInput();
adminAuthOrFail($body);

try {
    $pdo = db();
    adminEnsureSchemaCached($pdo, 600);

    [$periodoInicio, $periodoFim, $periodoModo] = adminDateRangeFromQuery();
    $painel = adminGetPainelData();
    $resultados = adminGetResultadosData();

    if ($method === 'GET') {
        $module = strtolower(trim((string)($_GET['module'] ?? 'overview')));

        if ($module === 'overview') {
            $usuariosPainel = $painel['usuarios'];
            $apostasPainel = $painel['apostas'];

            $totalApostado = 0.0;
            $totalPremiosApostas = 0.0;
            $apostasPeriodo = 0;

            foreach ($apostasPainel as $a) {
                if (!is_array($a)) {
                    continue;
                }
                $d = adminApostaDate($a);
                if (!adminInDateRange($d, $periodoInicio, $periodoFim)) {
                    continue;
                }
                $apostasPeriodo++;
                $totalApostado += adminApostaValor($a);
                $totalPremiosApostas += adminApostaPremio($a);
            }

            $totalUsuariosAtivos = 0;
            $totalPromotores = 0;
            foreach ($usuariosPainel as $u) {
                if (!is_array($u)) {
                    continue;
                }
                $bloqueado = (bool)($u['bloqueado'] ?? false);
                if (!$bloqueado) {
                    $totalUsuariosAtivos++;
                }
                $role = strtolower(trim((string)($u['role'] ?? $u['perfil'] ?? '')));
                if ($role === 'promotor') {
                    $totalPromotores++;
                }
            }

            $rowSaldo = $pdo->query('SELECT COALESCE(SUM(saldo), 0) AS total_saldo FROM usuarios')->fetch() ?: [];
            $saldoBanca = adminToFloat($rowSaldo['total_saldo'] ?? 0);

            $rowDep = [
                'total_depositado' => 0,
                'depositos_pendentes' => 0,
                'depositos_pagos' => 0,
            ];
            if (adminTableExists($pdo, 'depositos')) {
                $qDep = $pdo->prepare(
                    "SELECT
                        COALESCE(SUM(valor), 0) AS total_depositado,
                        SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) AS depositos_pendentes,
                        SUM(CASE WHEN status = 'PAGO' THEN 1 ELSE 0 END) AS depositos_pagos
                     FROM depositos
                     WHERE DATE(COALESCE(pago_em, criado_em)) BETWEEN :inicio AND :fim"
                );
                $qDep->execute([':inicio' => $periodoInicio, ':fim' => $periodoFim]);
                $rowDep = $qDep->fetch() ?: $rowDep;
            }
            $totalDepositado = adminToFloat($rowDep['total_depositado'] ?? 0);

            $rowSaque = [
                'total_sacado' => 0,
                'saques_pendentes' => 0,
            ];
            if (adminTableExists($pdo, 'saques')) {
                $qSaque = $pdo->prepare(
                    "SELECT
                        COALESCE(SUM(CASE WHEN status IN ('pago', 'aprovado') THEN valor ELSE 0 END), 0) AS total_sacado,
                        SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END) AS saques_pendentes
                     FROM saques
                     WHERE DATE(criado_em) BETWEEN :inicio AND :fim"
                );
                $qSaque->execute([':inicio' => $periodoInicio, ':fim' => $periodoFim]);
                $rowSaque = $qSaque->fetch() ?: $rowSaque;
            }
            $totalSacado = adminToFloat($rowSaque['total_sacado'] ?? 0);

            $rowCom = [
                'comissoes_pendentes' => 0,
                'comissoes_pagas' => 0,
            ];
            if (adminTableExists($pdo, 'comissoes')) {
                $qCom = $pdo->prepare(
                    "SELECT
                        COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor_comissao ELSE 0 END), 0) AS comissoes_pendentes,
                        COALESCE(SUM(CASE WHEN status = 'paga' THEN valor_comissao ELSE 0 END), 0) AS comissoes_pagas
                     FROM comissoes
                     WHERE DATE(criado_em) BETWEEN :inicio AND :fim"
                );
                $qCom->execute([':inicio' => $periodoInicio, ':fim' => $periodoFim]);
                $rowCom = $qCom->fetch() ?: $rowCom;
            }

            $rowPrem = ['total_premios' => 0];
            if (adminTableExists($pdo, 'premios')) {
                $qPremios = $pdo->prepare(
                    'SELECT COALESCE(SUM(valor_premio), 0) AS total_premios FROM premios WHERE DATE(criado_em) BETWEEN :inicio AND :fim'
                );
                $qPremios->execute([':inicio' => $periodoInicio, ':fim' => $periodoFim]);
                $rowPrem = $qPremios->fetch() ?: $rowPrem;
            }
            $totalPremiosRegistrados = adminToFloat($rowPrem['total_premios'] ?? 0);

            $premiosPagos = (float)number_format($totalPremiosApostas + $totalPremiosRegistrados, 2, '.', '');
            $comissoesPendentes = adminToFloat($rowCom['comissoes_pendentes'] ?? 0);
            $comissoesPagas = adminToFloat($rowCom['comissoes_pagas'] ?? 0);

            $lucroPrejuizo = (float)number_format(
                ($totalApostado + $totalDepositado) - ($premiosPagos + $totalSacado + $comissoesPagas),
                2,
                '.',
                ''
            );

            adminResponse(200, [
                'ok' => true,
                'periodo' => [
                    'modo' => $periodoModo,
                    'inicio' => $periodoInicio,
                    'fim' => $periodoFim,
                ],
                'visao_geral' => [
                    'saldo_total_banca' => $saldoBanca,
                    'total_depositado' => $totalDepositado,
                    'total_sacado' => $totalSacado,
                    'total_apostado' => (float)number_format($totalApostado, 2, '.', ''),
                    'total_pago_premios' => $premiosPagos,
                    'lucro_prejuizo' => $lucroPrejuizo,
                    'usuarios_ativos' => $totalUsuariosAtivos,
                    'promotores' => $totalPromotores,
                    'apostas_periodo' => $apostasPeriodo,
                    'comissoes_pendentes' => $comissoesPendentes,
                    'comissoes_pagas' => $comissoesPagas,
                    'depositos_pendentes' => (int)($rowDep['depositos_pendentes'] ?? 0),
                    'depositos_pagos' => (int)($rowDep['depositos_pagos'] ?? 0),
                    'saques_pendentes' => (int)($rowSaque['saques_pendentes'] ?? 0),
                ],
            ]);
        }

        if ($module === 'usuarios') {
            if (!adminTableExists($pdo, 'usuarios')) {
                adminResponse(200, ['ok' => true, 'total' => 0, 'usuarios' => []]);
            }

            $nome = trim((string)($_GET['nome'] ?? ''));
            $cpf = onlyDigits((string)($_GET['cpf'] ?? ''));
            $whatsapp = onlyDigits((string)($_GET['whatsapp'] ?? ''));
            $status = strtolower(trim((string)($_GET['status'] ?? '')));

            $hasPromotorId = adminColumnExists($pdo, 'usuarios', 'promotor_id');
            $hasIndicadorId = adminColumnExists($pdo, 'usuarios', 'indicador_id');
            $hasPerfil = adminColumnExists($pdo, 'usuarios', 'perfil');
            $hasBloqueado = adminColumnExists($pdo, 'usuarios', 'bloqueado');
            $hasStatus = adminColumnExists($pdo, 'usuarios', 'status');
            $hasComissao = adminColumnExists($pdo, 'usuarios', 'comissao_percentual');
            $hasChavePix = adminColumnExists($pdo, 'usuarios', 'chave_pix');
            $hasWhatsapp = adminColumnExists($pdo, 'usuarios', 'whatsapp');

            $where = ['1=1'];
            $params = [];

            if ($nome !== '') {
                $where[] = 'u.nome LIKE :nome';
                $params[':nome'] = '%' . $nome . '%';
            }
            if ($cpf !== '') {
                $where[] = 'u.cpf_cnpj LIKE :cpf';
                $params[':cpf'] = '%' . $cpf . '%';
            }
            if ($whatsapp !== '' && $hasWhatsapp) {
                $where[] = 'u.whatsapp LIKE :whatsapp';
                $params[':whatsapp'] = '%' . $whatsapp . '%';
            }
            if ($status === 'bloqueado') {
                if ($hasBloqueado && $hasStatus) {
                    $where[] = "(COALESCE(u.bloqueado,0) = 1 OR UPPER(COALESCE(u.status,'')) = 'BLOQUEADO')";
                } elseif ($hasBloqueado) {
                    $where[] = '(COALESCE(u.bloqueado,0) = 1)';
                } elseif ($hasStatus) {
                    $where[] = "(UPPER(COALESCE(u.status,'')) = 'BLOQUEADO')";
                } else {
                    $where[] = '1=0';
                }
            } elseif ($status === 'ativo') {
                if ($hasBloqueado && $hasStatus) {
                    $where[] = "(COALESCE(u.bloqueado,0) = 0 AND UPPER(COALESCE(u.status,'ATIVO')) <> 'BLOQUEADO')";
                } elseif ($hasBloqueado) {
                    $where[] = '(COALESCE(u.bloqueado,0) = 0)';
                } elseif ($hasStatus) {
                    $where[] = "(UPPER(COALESCE(u.status,'ATIVO')) <> 'BLOQUEADO')";
                }
            }

            $selectPromotor = $hasPromotorId
                ? 'p.nome AS promotor_nome, p.login AS promotor_login'
                : "NULL AS promotor_nome, NULL AS promotor_login";
            $selectIndicador = $hasIndicadorId
                ? 'i.nome AS indicador_nome, i.login AS indicador_login'
                : "NULL AS indicador_nome, NULL AS indicador_login";
            $selectPerfil = $hasPerfil ? 'u.perfil' : "'apostador' AS perfil";
            $selectComissao = $hasComissao ? 'u.comissao_percentual' : '0 AS comissao_percentual';
            $selectBloqueado = $hasBloqueado ? 'u.bloqueado' : '0 AS bloqueado';
            $selectStatus = $hasStatus ? 'u.status' : "'ATIVO' AS status";
            $selectPromotorId = $hasPromotorId ? 'u.promotor_id' : 'NULL AS promotor_id';
            $selectIndicadorId = $hasIndicadorId ? 'u.indicador_id' : 'NULL AS indicador_id';
            $selectChavePix = $hasChavePix ? 'u.chave_pix' : "NULL AS chave_pix";
            $joinPromotor = $hasPromotorId ? 'LEFT JOIN usuarios p ON p.id = u.promotor_id' : '';
            $joinIndicador = $hasIndicadorId ? 'LEFT JOIN usuarios i ON i.id = u.indicador_id' : '';

            $sql =
                'SELECT u.id, u.nome, u.login, u.cpf_cnpj, ' . ($hasWhatsapp ? 'u.whatsapp' : "NULL AS whatsapp") . ', u.saldo, ' .
                        $selectPerfil . ', ' .
                        $selectComissao . ', ' .
                        $selectBloqueado . ', ' .
                        $selectStatus . ', ' .
                        $selectPromotorId . ', ' .
                        $selectIndicadorId . ', ' .
                        $selectChavePix . ', ' .
                        $selectPromotor . ', ' .
                        $selectIndicador . '
                 FROM usuarios u
                 ' . $joinPromotor . '
                 ' . $joinIndicador . '
                 WHERE ' . implode(' AND ', $where) .
                ' ORDER BY u.id DESC LIMIT 500';

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll() ?: [];

            adminResponse(200, [
                'ok' => true,
                'total' => count($rows),
                'usuarios' => $rows,
            ]);
        }

        if ($module === 'promotores') {
            if (!adminTableExists($pdo, 'comissoes')) {
                adminResponse(200, ['ok' => true, 'total' => 0, 'promotores' => []]);
            }
            if (!adminTableExists($pdo, 'usuarios')) {
                adminResponse(200, ['ok' => true, 'total' => 0, 'promotores' => []]);
            }

            $hasPerfil = adminColumnExists($pdo, 'usuarios', 'perfil');
            $hasComissao = adminColumnExists($pdo, 'usuarios', 'comissao_percentual');
            $hasBloqueado = adminColumnExists($pdo, 'usuarios', 'bloqueado');
            $hasPromotorId = adminColumnExists($pdo, 'usuarios', 'promotor_id');
            $hasWhatsapp = adminColumnExists($pdo, 'usuarios', 'whatsapp');
            $hasPromotoresTable = adminTableExists($pdo, 'promotores');

            if (!$hasPromotorId || !$hasPerfil) {
                $fallback = "SELECT u.id, u.nome, u.login, u.cpf_cnpj, " .
                    ($hasWhatsapp ? "u.whatsapp" : "NULL AS whatsapp") . ", u.saldo, " .
                    ($hasComissao ? "COALESCE(u.comissao_percentual,0)" : "0") . " AS comissao_percentual, " .
                    ($hasBloqueado ? "COALESCE(u.bloqueado,0)" : "0") . " AS bloqueado, " .
                    "0 AS base_apostadores, 0 AS total_apostado_base, 0 AS total_comissao_gerada, 0 AS total_comissao_paga
                    FROM usuarios u
                    WHERE LOWER(COALESCE(u.perfil, '')) = 'promotor'
                    ORDER BY u.nome ASC";
                $rows = $pdo->query($fallback)->fetchAll() ?: [];
                adminResponse(200, ['ok' => true, 'total' => count($rows), 'promotores' => $rows]);
            }

            $sql =
                "SELECT u.id, u.nome, u.login, u.cpf_cnpj, u.whatsapp, u.saldo,
                        " . ($hasComissao ? "COALESCE(u.comissao_percentual, 0)" : "0") . " AS comissao_percentual,
                        " . ($hasBloqueado ? "COALESCE(u.bloqueado, 0)" : "0") . " AS bloqueado,
                        COALESCE(stats.base_apostadores, 0) AS base_apostadores,
                        COALESCE(stats.total_apostado_base, 0) AS total_apostado_base,
                        COALESCE(com.total_comissao_gerada, 0) AS total_comissao_gerada,
                        COALESCE(com.total_comissao_paga, 0) AS total_comissao_paga
                 FROM usuarios u
                 LEFT JOIN (
                    SELECT promotor_id,
                           COUNT(*) AS base_apostadores,
                           COALESCE(SUM(saldo), 0) AS total_apostado_base
                    FROM usuarios
                    WHERE promotor_id IS NOT NULL
                    GROUP BY promotor_id
                 ) stats ON stats.promotor_id = u.id
                 LEFT JOIN (
                    SELECT promotor_usuario_id,
                           COALESCE(SUM(valor_comissao), 0) AS total_comissao_gerada,
                           COALESCE(SUM(CASE WHEN status = 'paga' THEN valor_comissao ELSE 0 END), 0) AS total_comissao_paga
                    FROM comissoes
                    GROUP BY promotor_usuario_id
                 ) com ON com.promotor_usuario_id = u.id
                 WHERE LOWER(COALESCE(u.perfil, '')) = 'promotor'
                    " . ($hasPromotoresTable ? "OR u.id IN (SELECT usuario_id FROM promotores)" : "") . "
                 ORDER BY u.nome ASC";

            $rows = $pdo->query($sql)->fetchAll() ?: [];
            adminResponse(200, [
                'ok' => true,
                'total' => count($rows),
                'promotores' => $rows,
            ]);
        }

        if ($module === 'indicacoes') {
            if (!adminTableExists($pdo, 'indicacoes')) {
                adminResponse(200, ['ok' => true, 'total' => 0, 'indicacoes' => []]);
            }
            $sql =
                'SELECT i.id, i.indicador_usuario_id, i.indicado_usuario_id, i.origem, i.criado_em,
                        u1.nome AS indicador_nome, u1.login AS indicador_login,
                        u2.nome AS indicado_nome, u2.login AS indicado_login,
                        COALESCE(c.total_comissao, 0) AS total_comissao
                 FROM indicacoes i
                 LEFT JOIN usuarios u1 ON u1.id = i.indicador_usuario_id
                 LEFT JOIN usuarios u2 ON u2.id = i.indicado_usuario_id
                 LEFT JOIN (
                    SELECT apostador_usuario_id, COALESCE(SUM(valor_comissao),0) AS total_comissao
                    FROM comissoes
                    GROUP BY apostador_usuario_id
                 ) c ON c.apostador_usuario_id = i.indicado_usuario_id
                 ORDER BY i.criado_em DESC
                 LIMIT 1000';

            $rows = $pdo->query($sql)->fetchAll() ?: [];
            adminResponse(200, [
                'ok' => true,
                'total' => count($rows),
                'indicacoes' => $rows,
            ]);
        }

        if ($module === 'apostas') {
            $lista = [];
            $usuarioFiltro = trim((string)($_GET['usuario'] ?? ''));
            $statusFiltro = strtolower(trim((string)($_GET['status'] ?? '')));
            $tipoFiltro = strtolower(trim((string)($_GET['tipo'] ?? '')));
            $loteriaFiltro = strtolower(trim((string)($_GET['loteria'] ?? '')));

            foreach ($painel['apostas'] as $a) {
                if (!is_array($a)) {
                    continue;
                }

                $dataAposta = adminApostaDate($a);
                if (!adminInDateRange($dataAposta, $periodoInicio, $periodoFim)) {
                    continue;
                }

                $status = adminApostaStatus($a);
                $tipo = strtolower(trim((string)($a['tipo'] ?? '')));
                $loteria = strtolower(trim((string)($a['loteria'] ?? '')));
                $nome = strtolower(trim((string)($a['usuarioNome'] ?? $a['usuario'] ?? '')));

                if ($statusFiltro !== '' && $statusFiltro !== $status) {
                    continue;
                }
                if ($tipoFiltro !== '' && $tipoFiltro !== $tipo) {
                    continue;
                }
                if ($loteriaFiltro !== '' && !str_contains($loteria, $loteriaFiltro)) {
                    continue;
                }
                if ($usuarioFiltro !== '' && !str_contains($nome, strtolower($usuarioFiltro))) {
                    continue;
                }

                $lista[] = [
                    'id' => $a['id'] ?? null,
                    'data' => $dataAposta,
                    'usuario' => $a['usuarioNome'] ?? $a['usuario'] ?? '',
                    'usuario_id' => (int)($a['usuarioId'] ?? 0),
                    'promotor_id' => (int)($a['promotorId'] ?? 0),
                    'loteria' => $a['loteria'] ?? '',
                    'tipo' => $a['tipo'] ?? '',
                    'status' => $status,
                    'valor' => adminApostaValor($a),
                    'premio' => adminApostaPremio($a),
                    'possivel_premio' => adminToFloat($a['possivelPremio'] ?? 0),
                    'palpite' => $a['palpite'] ?? $a['grupo'] ?? $a['dezenas'] ?? '',
                    'resultado_vinculado' => $a['resultado'] ?? null,
                    'horario' => $a['horario'] ?? '',
                    'raw' => $a,
                ];
            }

            usort($lista, static function (array $a, array $b): int {
                return strcmp((string)$b['data'], (string)$a['data']);
            });

            adminResponse(200, [
                'ok' => true,
                'total' => count($lista),
                'apostas' => $lista,
            ]);
        }

        if ($module === 'resultados') {
            $items = [];
            foreach ($resultados['dados'] as $dia => $registroDia) {
                if (!is_array($registroDia)) {
                    continue;
                }
                $data = adminNormalizeDate((string)$dia);
                if (!adminInDateRange($data, $periodoInicio, $periodoFim)) {
                    continue;
                }

                foreach ($registroDia as $praca => $loterias) {
                    if (!is_array($loterias)) {
                        continue;
                    }
                    foreach ($loterias as $loteria => $linhas) {
                        if (!is_array($linhas)) {
                            continue;
                        }
                        $items[] = [
                            'data' => $data,
                            'praca' => (string)$praca,
                            'loteria' => (string)$loteria,
                            'resultado' => $linhas,
                        ];
                    }
                }
            }

            usort($items, static function (array $a, array $b): int {
                $cmp = strcmp((string)$b['data'], (string)$a['data']);
                if ($cmp !== 0) {
                    return $cmp;
                }
                return strcmp((string)$a['loteria'], (string)$b['loteria']);
            });

            adminResponse(200, [
                'ok' => true,
                'total' => count($items),
                'resultados' => array_slice($items, 0, 600),
            ]);
        }

        if ($module === 'premios') {
            $premiadas = [];
            foreach ($painel['apostas'] as $a) {
                if (!is_array($a)) {
                    continue;
                }
                $premio = adminApostaPremio($a);
                if ($premio <= 0) {
                    continue;
                }
                $dataAposta = adminApostaDate($a);
                if (!adminInDateRange($dataAposta, $periodoInicio, $periodoFim)) {
                    continue;
                }
                $premiadas[] = [
                    'id' => $a['id'] ?? null,
                    'usuario_id' => (int)($a['usuarioId'] ?? 0),
                    'usuario' => $a['usuarioNome'] ?? $a['usuario'] ?? '',
                    'loteria' => $a['loteria'] ?? '',
                    'tipo' => $a['tipo'] ?? '',
                    'data' => $dataAposta,
                    'valor_apostado' => adminApostaValor($a),
                    'valor_premio' => $premio,
                    'palpite_premiado' => $a['palpite'] ?? $a['grupo'] ?? '',
                    'status' => 'apurado',
                ];
            }

            $registros = [];
            if (adminTableExists($pdo, 'premios')) {
                $qPremios = $pdo->prepare(
                    'SELECT * FROM premios WHERE DATE(criado_em) BETWEEN :inicio AND :fim ORDER BY criado_em DESC LIMIT 1000'
                );
                $qPremios->execute([':inicio' => $periodoInicio, ':fim' => $periodoFim]);
                $registros = $qPremios->fetchAll() ?: [];
            }

            adminResponse(200, [
                'ok' => true,
                'premiadas_apostas' => $premiadas,
                'premios_registrados' => $registros,
                'totais' => [
                    'apostas_premiadas' => count($premiadas),
                    'valor_apostas_premiadas' => (float)number_format(array_sum(array_map(static fn ($x) => adminToFloat($x['valor_premio'] ?? 0), $premiadas)), 2, '.', ''),
                    'registros_premios' => count($registros),
                    'valor_registros_premios' => (float)number_format(array_sum(array_map(static fn ($x) => adminToFloat($x['valor_premio'] ?? 0), $registros)), 2, '.', ''),
                ],
            ]);
        }

        if ($module === 'financeiro') {
            if (!adminTableExists($pdo, 'movimentacoes_saldo')) {
                adminResponse(200, ['ok' => true, 'movimentacoes' => [], 'saldos' => []]);
            }
            $qMov = $pdo->prepare(
                'SELECT m.*, u.nome AS usuario_nome, u.login AS usuario_login
                 FROM movimentacoes_saldo m
                 LEFT JOIN usuarios u ON u.id = m.usuario_id
                 WHERE DATE(m.criado_em) BETWEEN :inicio AND :fim
                 ORDER BY m.criado_em DESC
                 LIMIT 1500'
            );
            $qMov->execute([':inicio' => $periodoInicio, ':fim' => $periodoFim]);
            $movs = $qMov->fetchAll() ?: [];

            $qBal = $pdo->query('SELECT id, nome, login, saldo FROM usuarios ORDER BY saldo DESC LIMIT 500');
            $saldos = $qBal->fetchAll() ?: [];

            adminResponse(200, [
                'ok' => true,
                'movimentacoes' => $movs,
                'saldos' => $saldos,
            ]);
        }

        if ($module === 'depositos') {
            $status = strtoupper(trim((string)($_GET['status'] ?? '')));
            $where = 'DATE(COALESCE(pago_em, criado_em)) BETWEEN :inicio AND :fim';
            $params = [':inicio' => $periodoInicio, ':fim' => $periodoFim];
            if ($status !== '') {
                $where .= ' AND status = :status';
                $params[':status'] = $status;
            }

            $stmt = $pdo->prepare(
                'SELECT d.*, u.nome AS usuario_nome, u.login AS usuario_login
                 FROM depositos d
                 LEFT JOIN usuarios u ON u.id = d.usuario_id
                 WHERE ' . $where . '
                 ORDER BY d.id DESC
                 LIMIT 1200'
            );
            $stmt->execute($params);
            $rows = $stmt->fetchAll() ?: [];

            adminResponse(200, [
                'ok' => true,
                'total' => count($rows),
                'depositos' => $rows,
            ]);
        }

        if ($module === 'saques') {
            if (!adminTableExists($pdo, 'saques')) {
                adminResponse(200, ['ok' => true, 'total' => 0, 'saques' => []]);
            }
            $status = strtolower(trim((string)($_GET['status'] ?? '')));
            $where = 'DATE(s.criado_em) BETWEEN :inicio AND :fim';
            $params = [':inicio' => $periodoInicio, ':fim' => $periodoFim];
            if ($status !== '') {
                $where .= ' AND s.status = :status';
                $params[':status'] = $status;
            }

            $stmt = $pdo->prepare(
                'SELECT s.*, u.nome AS usuario_nome, u.login AS usuario_login
                 FROM saques s
                 LEFT JOIN usuarios u ON u.id = s.usuario_id
                 WHERE ' . $where . '
                 ORDER BY s.id DESC
                 LIMIT 1200'
            );
            $stmt->execute($params);
            $rows = $stmt->fetchAll() ?: [];

            adminResponse(200, [
                'ok' => true,
                'total' => count($rows),
                'saques' => $rows,
            ]);
        }

        if ($module === 'comissoes') {
            if (!adminTableExists($pdo, 'comissoes')) {
                adminResponse(200, ['ok' => true, 'total' => 0, 'comissoes' => []]);
            }
            $status = strtolower(trim((string)($_GET['status'] ?? '')));
            $where = 'DATE(c.criado_em) BETWEEN :inicio AND :fim';
            $params = [':inicio' => $periodoInicio, ':fim' => $periodoFim];
            if ($status !== '') {
                $where .= ' AND c.status = :status';
                $params[':status'] = $status;
            }

            $stmt = $pdo->prepare(
                'SELECT c.*, p.nome AS promotor_nome, p.login AS promotor_login,
                        a.nome AS apostador_nome, a.login AS apostador_login
                 FROM comissoes c
                 LEFT JOIN usuarios p ON p.id = c.promotor_usuario_id
                 LEFT JOIN usuarios a ON a.id = c.apostador_usuario_id
                 WHERE ' . $where . '
                 ORDER BY c.id DESC
                 LIMIT 1200'
            );
            $stmt->execute($params);
            $rows = $stmt->fetchAll() ?: [];

            adminResponse(200, [
                'ok' => true,
                'total' => count($rows),
                'comissoes' => $rows,
            ]);
        }

        if ($module === 'auditoria') {
            if (!adminTableExists($pdo, 'auditoria_admin')) {
                adminResponse(200, ['ok' => true, 'total' => 0, 'auditoria' => []]);
            }
            $stmt = $pdo->prepare(
                'SELECT *
                 FROM auditoria_admin
                 WHERE DATE(criado_em) BETWEEN :inicio AND :fim
                 ORDER BY id DESC
                 LIMIT 2000'
            );
            $stmt->execute([':inicio' => $periodoInicio, ':fim' => $periodoFim]);
            $rows = $stmt->fetchAll() ?: [];

            adminResponse(200, [
                'ok' => true,
                'total' => count($rows),
                'auditoria' => $rows,
            ]);
        }

        if ($module === 'export_csv') {
            $tipo = strtolower(trim((string)($_GET['tipo'] ?? 'overview')));
            $arquivo = 'relatorio-' . $tipo . '-' . date('Ymd-His') . '.csv';

            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $arquivo . '"');

            $out = fopen('php://output', 'wb');
            if ($out === false) {
                exit;
            }

            if ($tipo === 'depositos') {
                fputcsv($out, ['ID', 'Usuario', 'Payment ID', 'Valor', 'Status', 'Criado em', 'Pago em']);
                $rows = $pdo->query('SELECT d.id, COALESCE(u.nome, u.login, CONCAT("Usuario #", d.usuario_id)) AS usuario, d.asaas_payment_id, d.valor, d.status, d.criado_em, d.pago_em FROM depositos d LEFT JOIN usuarios u ON u.id = d.usuario_id ORDER BY d.id DESC LIMIT 5000')->fetchAll() ?: [];
                foreach ($rows as $r) {
                    fputcsv($out, [$r['id'], $r['usuario'], $r['asaas_payment_id'], $r['valor'], $r['status'], $r['criado_em'], $r['pago_em']]);
                }
            } elseif ($tipo === 'saques') {
                fputcsv($out, ['ID', 'Usuario', 'Valor', 'Status', 'Chave Pix', 'Criado em', 'Pago em']);
                $rows = $pdo->query('SELECT s.id, COALESCE(u.nome, u.login, CONCAT("Usuario #", s.usuario_id)) AS usuario, s.valor, s.status, s.chave_pix, s.criado_em, s.pago_em FROM saques s LEFT JOIN usuarios u ON u.id = s.usuario_id ORDER BY s.id DESC LIMIT 5000')->fetchAll() ?: [];
                foreach ($rows as $r) {
                    fputcsv($out, [$r['id'], $r['usuario'], $r['valor'], $r['status'], $r['chave_pix'], $r['criado_em'], $r['pago_em']]);
                }
            } else {
                fputcsv($out, ['Metrica', 'Valor']);
                fputcsv($out, ['Periodo inicio', $periodoInicio]);
                fputcsv($out, ['Periodo fim', $periodoFim]);
                $r = $pdo->query('SELECT COALESCE(SUM(saldo),0) AS saldo FROM usuarios')->fetch() ?: [];
                fputcsv($out, ['Saldo total banca', adminToFloat($r['saldo'] ?? 0)]);
            }

            fclose($out);
            exit;
        }

        adminResponse(404, [
            'ok' => false,
            'error' => 'Módulo inválido no dashboard admin.',
        ]);
    }

    if ($method !== 'POST') {
        adminResponse(405, [
            'ok' => false,
            'error' => 'Método não permitido.',
        ]);
    }

    $action = strtolower(trim((string)($body['action'] ?? '')));
    if ($action === '') {
        adminResponse(422, ['ok' => false, 'error' => 'Ação obrigatória.']);
    }

    if ($action === 'user_block_toggle') {
        $userId = (int)($body['usuario_id'] ?? 0);
        $bloquear = (int)($body['bloquear'] ?? 1) === 1;
        $just = trim((string)($body['justificativa'] ?? 'Bloqueio manual pelo admin.'));

        if ($userId <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Usuário inválido.']);
        }

        $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $u = $stmt->fetch();
        if (!$u) {
            adminResponse(404, ['ok' => false, 'error' => 'Usuário não encontrado.']);
        }

        $status = $bloquear ? 'BLOQUEADO' : 'ATIVO';
        $up = $pdo->prepare('UPDATE usuarios SET bloqueado = :bloq, status = :status WHERE id = :id LIMIT 1');
        $up->execute([
            ':bloq' => $bloquear ? 1 : 0,
            ':status' => $status,
            ':id' => $userId,
        ]);

        adminAudit($pdo, $bloquear ? 'bloquear_usuario' : 'desbloquear_usuario', 'usuarios', (string)$userId, $u, ['bloqueado' => $bloquear, 'status' => $status], $just, null, 'admin');

        adminResponse(200, [
            'ok' => true,
            'message' => $bloquear ? 'Usuário bloqueado.' : 'Usuário desbloqueado.',
        ]);
    }

    if ($action === 'user_update') {
        $userId = (int)($body['usuario_id'] ?? 0);
        if ($userId <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Usuário inválido.']);
        }

        $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $u = $stmt->fetch();
        if (!$u) {
            adminResponse(404, ['ok' => false, 'error' => 'Usuário não encontrado.']);
        }

        $nome = trim((string)($body['nome'] ?? $u['nome'] ?? ''));
        $cpf = adminNormalizeOptionalCpf((string)($body['cpf_cnpj'] ?? $u['cpf_cnpj'] ?? ''));
        $whatsapp = adminNormalizeOptionalWhatsapp((string)($body['whatsapp'] ?? $u['whatsapp'] ?? ''));
        $perfil = strtolower(trim((string)($body['perfil'] ?? $u['perfil'] ?? 'apostador')));
        if (!in_array($perfil, ['admin', 'operador', 'promotor', 'apostador'], true)) {
            $perfil = 'apostador';
        }

        $promotorId = isset($body['promotor_id']) ? (int)$body['promotor_id'] : (isset($u['promotor_id']) ? (int)$u['promotor_id'] : null);
        if ($promotorId !== null && $promotorId <= 0) {
            $promotorId = null;
        }

        $indicadorId = isset($body['indicador_id']) ? (int)$body['indicador_id'] : (isset($u['indicador_id']) ? (int)$u['indicador_id'] : null);
        if ($indicadorId !== null && $indicadorId <= 0) {
            $indicadorId = null;
        }

        $comissaoPercentual = adminToFloat($body['comissao_percentual'] ?? $u['comissao_percentual'] ?? 0);
        $chavePix = trim((string)($body['chave_pix'] ?? $u['chave_pix'] ?? ''));

        $perfilAtual = strtolower(trim((string)($u['perfil'] ?? 'apostador')));
        $promotorAtual = isset($u['promotor_id']) ? (int)$u['promotor_id'] : null;
        if ($promotorAtual !== null && $promotorAtual <= 0) {
            $promotorAtual = null;
        }

        if ($perfil === 'apostador' && $promotorId !== null && $promotorId === $userId) {
            adminResponse(422, ['ok' => false, 'error' => 'A base do apostador não pode ser ele mesmo.']);
        }

        if ($promotorId !== null) {
            $qPromotor = $pdo->prepare("SELECT id FROM usuarios WHERE id = :id AND LOWER(COALESCE(perfil, '')) = 'promotor' LIMIT 1");
            $qPromotor->execute([':id' => $promotorId]);
            if (!$qPromotor->fetch()) {
                adminResponse(422, ['ok' => false, 'error' => 'Promotor de destino inválido.']);
            }
        }

        if ($cpf !== null) {
            $qCpf = $pdo->prepare('SELECT id FROM usuarios WHERE cpf_cnpj = :cpf AND id <> :id LIMIT 1');
            $qCpf->execute([
                ':cpf' => $cpf,
                ':id' => $userId,
            ]);
            if ($qCpf->fetch()) {
                adminResponse(409, ['ok' => false, 'error' => 'CPF já cadastrado em outro usuário.']);
            }
        }

        if ($whatsapp !== null) {
            $qWpp = $pdo->prepare('SELECT id FROM usuarios WHERE whatsapp = :whatsapp AND id <> :id LIMIT 1');
            $qWpp->execute([
                ':whatsapp' => $whatsapp,
                ':id' => $userId,
            ]);
            if ($qWpp->fetch()) {
                adminResponse(409, ['ok' => false, 'error' => 'WhatsApp já cadastrado em outro usuário.']);
            }
        }

        $up = $pdo->prepare(
            'UPDATE usuarios
             SET nome = :nome,
                 cpf_cnpj = :cpf,
                 whatsapp = :whatsapp,
                 perfil = :perfil,
                 promotor_id = :promotor_id,
                 indicador_id = :indicador_id,
                 comissao_percentual = :comissao_percentual,
                 chave_pix = :chave_pix
             WHERE id = :id
             LIMIT 1'
        );
        $up->execute([
            ':nome' => $nome,
            ':cpf' => $cpf,
            ':whatsapp' => $whatsapp,
            ':perfil' => $perfil,
            ':promotor_id' => $promotorId,
            ':indicador_id' => $indicadorId,
            ':comissao_percentual' => $comissaoPercentual,
            ':chave_pix' => $chavePix,
            ':id' => $userId,
        ]);

        $comissoesCanceladas = 0;
        if (
            $perfilAtual === 'apostador' &&
            $perfil === 'apostador' &&
            $promotorAtual !== $promotorId &&
            $promotorAtual !== null
        ) {
            $comissoesCanceladas = adminCancelarComissoesPendentesPromotor(
                $pdo,
                $promotorAtual,
                $userId,
                'Comissão pendente cancelada por troca de base do apostador.'
            );
        }

        adminAudit($pdo, 'editar_usuario', 'usuarios', (string)$userId, $u, [
            'nome' => $nome,
            'cpf_cnpj' => $cpf,
            'whatsapp' => $whatsapp,
            'perfil' => $perfil,
            'promotor_id' => $promotorId,
            'indicador_id' => $indicadorId,
            'comissao_percentual' => $comissaoPercentual,
            'chave_pix' => $chavePix,
            'comissoes_pendentes_canceladas' => $comissoesCanceladas,
        ], trim((string)($body['justificativa'] ?? 'Edição administrativa.')));

        adminResponse(200, [
            'ok' => true,
            'message' => 'Usuário atualizado com sucesso.',
            'comissoes_pendentes_canceladas' => $comissoesCanceladas,
        ]);
    }

    if ($action === 'saldo_ajuste') {
        $userId = (int)($body['usuario_id'] ?? 0);
        $valor = adminToFloat($body['valor'] ?? 0);
        $tipo = strtolower(trim((string)($body['tipo'] ?? 'credito')));
        $motivo = trim((string)($body['motivo'] ?? 'Ajuste manual pelo admin.'));

        if ($userId <= 0 || $valor <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Usuário/valor inválido.']);
        }

        $pdo->beginTransaction();

        $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1 FOR UPDATE');
        $stmt->execute([':id' => $userId]);
        $u = $stmt->fetch();
        if (!$u) {
            $pdo->rollBack();
            adminResponse(404, ['ok' => false, 'error' => 'Usuário não encontrado.']);
        }

        $saldoAntes = adminToFloat($u['saldo'] ?? 0);
        $delta = $tipo === 'debito' ? -$valor : $valor;
        $saldoDepois = (float)number_format($saldoAntes + $delta, 2, '.', '');

        if ($saldoDepois < 0) {
            $pdo->rollBack();
            adminResponse(422, ['ok' => false, 'error' => 'Saldo insuficiente para débito.']);
        }

        $up = $pdo->prepare('UPDATE usuarios SET saldo = :saldo WHERE id = :id LIMIT 1');
        $up->execute([
            ':saldo' => $saldoDepois,
            ':id' => $userId,
        ]);

        $mov = $pdo->prepare(
            'INSERT INTO movimentacoes_saldo (
                usuario_id, tipo, valor, saldo_antes, saldo_depois,
                referencia_tipo, referencia_id, motivo, admin_responsavel_id, criado_em
            ) VALUES (
                :usuario_id, :tipo, :valor, :saldo_antes, :saldo_depois,
                :referencia_tipo, :referencia_id, :motivo, NULL, NOW()
            )'
        );
        $mov->execute([
            ':usuario_id' => $userId,
            ':tipo' => $tipo === 'debito' ? 'ajuste_debito' : 'ajuste_credito',
            ':valor' => abs($delta),
            ':saldo_antes' => $saldoAntes,
            ':saldo_depois' => $saldoDepois,
            ':referencia_tipo' => 'ajuste_admin',
            ':referencia_id' => (string)$userId,
            ':motivo' => $motivo,
        ]);

        $pdo->commit();

        adminAudit($pdo, 'ajuste_saldo', 'usuarios', (string)$userId, ['saldo' => $saldoAntes], ['saldo' => $saldoDepois, 'tipo' => $tipo, 'valor' => $valor], $motivo);

        adminResponse(200, [
            'ok' => true,
            'message' => 'Saldo ajustado com sucesso.',
            'saldo_antes' => $saldoAntes,
            'saldo_depois' => $saldoDepois,
        ]);
    }

    if ($action === 'promotor_criar') {
        $usuarioId = (int)($body['usuario_id'] ?? 0);
        $comissao = adminToFloat($body['comissao_percentual'] ?? 0);

        if ($usuarioId <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Usuário inválido.']);
        }

        $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $usuarioId]);
        $u = $stmt->fetch();
        if (!$u) {
            adminResponse(404, ['ok' => false, 'error' => 'Usuário não encontrado.']);
        }

        $up = $pdo->prepare("UPDATE usuarios SET perfil = 'promotor', comissao_percentual = :comissao WHERE id = :id LIMIT 1");
        $up->execute([
            ':comissao' => $comissao,
            ':id' => $usuarioId,
        ]);

        $ins = $pdo->prepare(
            'INSERT INTO promotores (usuario_id, nome_exibicao, comissao_percentual, ativo, criado_em, atualizado_em)
             VALUES (:usuario_id, :nome_exibicao, :comissao_percentual, 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
                nome_exibicao = VALUES(nome_exibicao),
                comissao_percentual = VALUES(comissao_percentual),
                ativo = 1,
                atualizado_em = NOW()'
        );
        $ins->execute([
            ':usuario_id' => $usuarioId,
            ':nome_exibicao' => adminUserDisplay($u),
            ':comissao_percentual' => $comissao,
        ]);

        adminAudit($pdo, 'criar_promotor', 'promotores', (string)$usuarioId, $u, ['perfil' => 'promotor', 'comissao_percentual' => $comissao], trim((string)($body['justificativa'] ?? 'Promoção para promotor.')));

        adminResponse(200, ['ok' => true, 'message' => 'Promotor criado/atualizado com sucesso.']);
    }

    if ($action === 'promotor_comissao_salvar') {
        $promotorId = (int)($body['promotor_usuario_id'] ?? 0);
        $percentual = adminToFloat($body['comissao_percentual'] ?? 0);

        if ($promotorId <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Promotor inválido.']);
        }

        $up = $pdo->prepare('UPDATE usuarios SET comissao_percentual = :p WHERE id = :id LIMIT 1');
        $up->execute([
            ':p' => $percentual,
            ':id' => $promotorId,
        ]);

        $upProm = $pdo->prepare('UPDATE promotores SET comissao_percentual = :p, atualizado_em = NOW() WHERE usuario_id = :id LIMIT 1');
        $upProm->execute([
            ':p' => $percentual,
            ':id' => $promotorId,
        ]);

        adminAudit($pdo, 'editar_comissao_promotor', 'promotores', (string)$promotorId, null, ['comissao_percentual' => $percentual], trim((string)($body['justificativa'] ?? 'Ajuste de comissão.')));

        adminResponse(200, ['ok' => true, 'message' => 'Comissão atualizada.']);
    }

    if ($action === 'apostador_transferir_base') {
        $apostadorId = (int)($body['apostador_id'] ?? 0);
        $destinoPromotorId = isset($body['destino_promotor_id']) ? (int)$body['destino_promotor_id'] : 0;
        $destinoPromotorId = $destinoPromotorId > 0 ? $destinoPromotorId : null; // null = base admin
        $justificativa = trim((string)($body['justificativa'] ?? 'Transferência de base do apostador.'));

        if ($apostadorId <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Apostador inválido.']);
        }

        $pdo->beginTransaction();

        $qApost = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1 FOR UPDATE');
        $qApost->execute([':id' => $apostadorId]);
        $apost = $qApost->fetch();
        if (!$apost) {
            $pdo->rollBack();
            adminResponse(404, ['ok' => false, 'error' => 'Apostador não encontrado.']);
        }

        $perfilApost = strtolower(trim((string)($apost['perfil'] ?? 'apostador')));
        if ($perfilApost !== 'apostador') {
            $pdo->rollBack();
            adminResponse(422, ['ok' => false, 'error' => 'Somente usuários apostadores podem ter base transferida.']);
        }

        $promotorAtual = isset($apost['promotor_id']) ? (int)$apost['promotor_id'] : null;
        if ($promotorAtual !== null && $promotorAtual <= 0) {
            $promotorAtual = null;
        }

        if ($destinoPromotorId !== null) {
            if ($destinoPromotorId === $apostadorId) {
                $pdo->rollBack();
                adminResponse(422, ['ok' => false, 'error' => 'A base do apostador não pode ser ele mesmo.']);
            }
            $qDest = $pdo->prepare("SELECT id FROM usuarios WHERE id = :id AND LOWER(COALESCE(perfil, '')) = 'promotor' LIMIT 1");
            $qDest->execute([':id' => $destinoPromotorId]);
            if (!$qDest->fetch()) {
                $pdo->rollBack();
                adminResponse(422, ['ok' => false, 'error' => 'Promotor de destino inválido.']);
            }
        }

        $upBase = $pdo->prepare('UPDATE usuarios SET promotor_id = :promotor_id WHERE id = :id LIMIT 1');
        $upBase->execute([
            ':promotor_id' => $destinoPromotorId,
            ':id' => $apostadorId,
        ]);

        $comissoesCanceladas = 0;
        if ($promotorAtual !== null && $promotorAtual !== $destinoPromotorId) {
            $comissoesCanceladas = adminCancelarComissoesPendentesPromotor(
                $pdo,
                $promotorAtual,
                $apostadorId,
                'Comissão pendente cancelada por retirada/troca de base do apostador.'
            );
        }

        $pdo->commit();

        adminAudit($pdo, 'transferir_base_apostador', 'usuarios', (string)$apostadorId, [
            'promotor_id' => $promotorAtual,
        ], [
            'promotor_id' => $destinoPromotorId,
            'comissoes_pendentes_canceladas' => $comissoesCanceladas,
        ], $justificativa);

        adminResponse(200, [
            'ok' => true,
            'message' => $destinoPromotorId === null
                ? 'Apostador movido para base do admin.'
                : 'Apostador transferido para novo promotor.',
            'comissoes_pendentes_canceladas' => $comissoesCanceladas,
        ]);
    }

    if ($action === 'usuario_promotor_excluir') {
        $usuarioId = (int)($body['usuario_id'] ?? 0);
        $destinoPromotorId = isset($body['destino_promotor_id']) ? (int)$body['destino_promotor_id'] : 0;
        $destinoPromotorId = $destinoPromotorId > 0 ? $destinoPromotorId : null; // null = base admin
        $justificativa = trim((string)($body['justificativa'] ?? 'Exclusão administrativa.'));

        if ($usuarioId <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Usuário inválido para exclusão.']);
        }

        $pdo->beginTransaction();

        $stmt = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1 FOR UPDATE');
        $stmt->execute([':id' => $usuarioId]);
        $u = $stmt->fetch();
        if (!$u) {
            $pdo->rollBack();
            adminResponse(404, ['ok' => false, 'error' => 'Usuário não encontrado.']);
        }

        if (adminIsProtectedAccount($u)) {
            $pdo->rollBack();
            adminResponse(422, ['ok' => false, 'error' => 'Não é permitido excluir a conta admin principal.']);
        }

        $perfil = strtolower(trim((string)($u['perfil'] ?? 'apostador')));

        if ($destinoPromotorId !== null) {
            $qDest = $pdo->prepare("SELECT id FROM usuarios WHERE id = :id AND LOWER(COALESCE(perfil, '')) = 'promotor' LIMIT 1");
            $qDest->execute([':id' => $destinoPromotorId]);
            if (!$qDest->fetch()) {
                $pdo->rollBack();
                adminResponse(422, ['ok' => false, 'error' => 'Promotor de destino inválido.']);
            }
        }

        $baseMovida = 0;
        $comissoesCanceladas = 0;

        if ($perfil === 'promotor') {
            $qBase = $pdo->prepare("SELECT id FROM usuarios WHERE promotor_id = :pid AND LOWER(COALESCE(perfil, '')) = 'apostador'");
            $qBase->execute([':pid' => $usuarioId]);
            $apostadores = $qBase->fetchAll() ?: [];

            if (!empty($apostadores)) {
                $upBase = $pdo->prepare("UPDATE usuarios SET promotor_id = :destino WHERE promotor_id = :origem AND LOWER(COALESCE(perfil, '')) = 'apostador'");
                $upBase->execute([
                    ':destino' => $destinoPromotorId,
                    ':origem' => $usuarioId,
                ]);
                $baseMovida = (int)$upBase->rowCount();

                if ($destinoPromotorId !== $usuarioId) {
                    $cancelStmt = $pdo->prepare(
                        "UPDATE comissoes
                         SET status = 'cancelada',
                             observacao = :obs,
                             atualizado_em = NOW()
                         WHERE promotor_usuario_id = :promotor_id
                           AND status = 'pendente'"
                    );
                    $cancelStmt->execute([
                        ':obs' => 'Comissão pendente cancelada por exclusão do promotor.',
                        ':promotor_id' => $usuarioId,
                    ]);
                    $comissoesCanceladas = (int)$cancelStmt->rowCount();
                }
            }

            $delProm = $pdo->prepare('DELETE FROM promotores WHERE usuario_id = :id LIMIT 1');
            $delProm->execute([':id' => $usuarioId]);
        } elseif ($perfil === 'apostador') {
            $promotorAtual = isset($u['promotor_id']) ? (int)$u['promotor_id'] : null;
            if ($promotorAtual !== null && $promotorAtual > 0) {
                $comissoesCanceladas = adminCancelarComissoesPendentesPromotor(
                    $pdo,
                    $promotorAtual,
                    $usuarioId,
                    'Comissão pendente cancelada por exclusão do apostador.'
                );
            }
        }

        $nullIndic = $pdo->prepare('UPDATE usuarios SET indicador_id = NULL WHERE indicador_id = :id');
        $nullIndic->execute([':id' => $usuarioId]);

        $nullPromotor = $pdo->prepare('UPDATE usuarios SET promotor_id = NULL WHERE promotor_id = :id');
        $nullPromotor->execute([':id' => $usuarioId]);

        $delSaques = $pdo->prepare('DELETE FROM saques WHERE usuario_id = :id');
        $delSaques->execute([':id' => $usuarioId]);

        $delMov = $pdo->prepare('DELETE FROM movimentacoes_saldo WHERE usuario_id = :id');
        $delMov->execute([':id' => $usuarioId]);

        $delPrem = $pdo->prepare('DELETE FROM premios WHERE usuario_id = :id');
        $delPrem->execute([':id' => $usuarioId]);

        $delCom = $pdo->prepare('DELETE FROM comissoes WHERE promotor_usuario_id = :id OR apostador_usuario_id = :id');
        $delCom->execute([':id' => $usuarioId]);

        $delIndA = $pdo->prepare('DELETE FROM indicacoes WHERE indicador_usuario_id = :id OR indicado_usuario_id = :id');
        $delIndA->execute([':id' => $usuarioId]);

        $delDep = $pdo->prepare('DELETE FROM depositos WHERE usuario_id = :id');
        $delDep->execute([':id' => $usuarioId]);

        $delUser = $pdo->prepare('DELETE FROM usuarios WHERE id = :id LIMIT 1');
        $delUser->execute([':id' => $usuarioId]);

        $pdo->commit();

        adminAudit($pdo, 'excluir_usuario_promotor', 'usuarios', (string)$usuarioId, $u, [
            'base_movida' => $baseMovida,
            'base_destino_promotor_id' => $destinoPromotorId,
            'comissoes_pendentes_canceladas' => $comissoesCanceladas,
        ], $justificativa);

        adminResponse(200, [
            'ok' => true,
            'message' => 'Usuário/promotor excluído com sucesso.',
            'base_movida' => $baseMovida,
            'comissoes_pendentes_canceladas' => $comissoesCanceladas,
        ]);
    }

    if ($action === 'comissao_marcar_paga') {
        $comissaoId = (int)($body['comissao_id'] ?? 0);
        if ($comissaoId <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Comissão inválida.']);
        }

        $stmt = $pdo->prepare('SELECT * FROM comissoes WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $comissaoId]);
        $c = $stmt->fetch();
        if (!$c) {
            adminResponse(404, ['ok' => false, 'error' => 'Comissão não encontrada.']);
        }

        $up = $pdo->prepare('UPDATE comissoes SET status = "paga", pago_em = NOW(), atualizado_em = NOW() WHERE id = :id LIMIT 1');
        $up->execute([':id' => $comissaoId]);

        adminAudit($pdo, 'comissao_paga', 'comissoes', (string)$comissaoId, $c, ['status' => 'paga'], trim((string)($body['justificativa'] ?? 'Comissão marcada como paga.')));

        adminResponse(200, ['ok' => true, 'message' => 'Comissão marcada como paga.']);
    }

    if ($action === 'saque_criar') {
        $usuarioId = (int)($body['usuario_id'] ?? 0);
        $valor = adminToFloat($body['valor'] ?? 0);
        $chavePix = trim((string)($body['chave_pix'] ?? ''));
        $obs = trim((string)($body['observacao'] ?? 'Solicitação criada no painel admin.'));

        if ($usuarioId <= 0 || $valor <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Dados inválidos para saque.']);
        }

        $ins = $pdo->prepare(
            "INSERT INTO saques (usuario_id, valor, chave_pix, status, observacao, criado_em, atualizado_em)
             VALUES (:usuario_id, :valor, :chave_pix, 'pendente', :observacao, NOW(), NOW())"
        );
        $ins->execute([
            ':usuario_id' => $usuarioId,
            ':valor' => $valor,
            ':chave_pix' => $chavePix,
            ':observacao' => $obs,
        ]);

        $saqueId = (int)$pdo->lastInsertId();
        adminAudit($pdo, 'saque_criado', 'saques', (string)$saqueId, null, ['usuario_id' => $usuarioId, 'valor' => $valor, 'status' => 'pendente'], $obs);

        adminResponse(200, ['ok' => true, 'message' => 'Saque criado.', 'saque_id' => $saqueId]);
    }

    if ($action === 'saque_atualizar_status') {
        $saqueId = (int)($body['saque_id'] ?? 0);
        $novoStatus = strtolower(trim((string)($body['status'] ?? '')));
        $obs = trim((string)($body['observacao'] ?? 'Atualização de status de saque.'));

        if ($saqueId <= 0 || !in_array($novoStatus, ['pendente', 'aprovado', 'recusado', 'pago'], true)) {
            adminResponse(422, ['ok' => false, 'error' => 'Saque/status inválido.']);
        }

        $pdo->beginTransaction();

        $stmt = $pdo->prepare('SELECT * FROM saques WHERE id = :id LIMIT 1 FOR UPDATE');
        $stmt->execute([':id' => $saqueId]);
        $saque = $stmt->fetch();
        if (!$saque) {
            $pdo->rollBack();
            adminResponse(404, ['ok' => false, 'error' => 'Saque não encontrado.']);
        }

        $statusAtual = strtolower(trim((string)($saque['status'] ?? 'pendente')));

        if ($novoStatus === 'pago' && $statusAtual !== 'pago') {
            $uid = (int)$saque['usuario_id'];
            $valor = adminToFloat($saque['valor'] ?? 0);

            $saldoStmt = $pdo->prepare('SELECT saldo FROM usuarios WHERE id = :id LIMIT 1 FOR UPDATE');
            $saldoStmt->execute([':id' => $uid]);
            $usrSaldo = $saldoStmt->fetch();
            if (!$usrSaldo) {
                $pdo->rollBack();
                adminResponse(404, ['ok' => false, 'error' => 'Usuário do saque não encontrado.']);
            }

            $saldoAntes = adminToFloat($usrSaldo['saldo'] ?? 0);
            $saldoDepois = (float)number_format($saldoAntes - $valor, 2, '.', '');
            if ($saldoDepois < 0) {
                $pdo->rollBack();
                adminResponse(422, ['ok' => false, 'error' => 'Saldo insuficiente para pagar saque.']);
            }

            $upSaldo = $pdo->prepare('UPDATE usuarios SET saldo = :saldo WHERE id = :id LIMIT 1');
            $upSaldo->execute([
                ':saldo' => $saldoDepois,
                ':id' => $uid,
            ]);

            $mov = $pdo->prepare(
                'INSERT INTO movimentacoes_saldo (
                    usuario_id, tipo, valor, saldo_antes, saldo_depois,
                    referencia_tipo, referencia_id, motivo, admin_responsavel_id, criado_em
                ) VALUES (
                    :usuario_id, "saque", :valor, :saldo_antes, :saldo_depois,
                    "saque", :referencia_id, :motivo, NULL, NOW()
                )'
            );
            $mov->execute([
                ':usuario_id' => $uid,
                ':valor' => $valor,
                ':saldo_antes' => $saldoAntes,
                ':saldo_depois' => $saldoDepois,
                ':referencia_id' => (string)$saqueId,
                ':motivo' => 'Pagamento de saque aprovado no painel.',
            ]);
        }

        $up = $pdo->prepare(
            "UPDATE saques
             SET status = :status,
                 observacao = :obs,
                 pago_em = CASE WHEN :status = 'pago' AND pago_em IS NULL THEN NOW() ELSE pago_em END,
                 atualizado_em = NOW()
             WHERE id = :id
             LIMIT 1"
        );
        $up->execute([
            ':status' => $novoStatus,
            ':obs' => $obs,
            ':id' => $saqueId,
        ]);

        $pdo->commit();

        adminAudit($pdo, 'saque_status', 'saques', (string)$saqueId, $saque, ['status' => $novoStatus, 'observacao' => $obs], $obs);

        adminResponse(200, ['ok' => true, 'message' => 'Status do saque atualizado.']);
    }

    if ($action === 'deposito_verificar_agora') {
        $depositoId = (int)($body['deposito_id'] ?? 0);
        if ($depositoId <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Depósito inválido.']);
        }

        $stmt = $pdo->prepare('SELECT * FROM depositos WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $depositoId]);
        $dep = $stmt->fetch();
        if (!$dep) {
            adminResponse(404, ['ok' => false, 'error' => 'Depósito não encontrado.']);
        }

        $res = adminSyncPendingDeposit($pdo, $dep);
        adminAudit($pdo, 'deposito_verificar_agora', 'depositos', (string)$depositoId, $dep, $res, trim((string)($body['justificativa'] ?? 'Verificação manual de depósito.')));
        adminResponse(200, [
            'ok' => true,
            'resultado' => $res,
        ]);
    }

    if ($action === 'depositos_sincronizar_pendentes') {
        $stmt = $pdo->query("SELECT * FROM depositos WHERE status = 'PENDENTE' ORDER BY id ASC LIMIT 80");
        $deps = $stmt->fetchAll() ?: [];

        $resultados = [];
        foreach ($deps as $dep) {
            $resultados[] = adminSyncPendingDeposit($pdo, $dep);
        }

        adminAudit($pdo, 'depositos_sincronizar_pendentes', 'depositos', 'batch', null, ['total' => count($resultados)], trim((string)($body['justificativa'] ?? 'Sincronização manual de pendentes.')));

        adminResponse(200, [
            'ok' => true,
            'total' => count($resultados),
            'resultados' => $resultados,
        ]);
    }

    if ($action === 'premio_marcar_pago') {
        $premioId = (int)($body['premio_id'] ?? 0);
        if ($premioId <= 0) {
            adminResponse(422, ['ok' => false, 'error' => 'Prêmio inválido.']);
        }

        $stmt = $pdo->prepare('SELECT * FROM premios WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $premioId]);
        $premio = $stmt->fetch();
        if (!$premio) {
            adminResponse(404, ['ok' => false, 'error' => 'Prêmio não encontrado.']);
        }

        $up = $pdo->prepare("UPDATE premios SET status = 'pago', pago_em = NOW(), atualizado_em = NOW() WHERE id = :id LIMIT 1");
        $up->execute([':id' => $premioId]);

        adminAudit($pdo, 'premio_pago', 'premios', (string)$premioId, $premio, ['status' => 'pago'], trim((string)($body['justificativa'] ?? 'Marcação manual de prêmio pago.')));

        adminResponse(200, ['ok' => true, 'message' => 'Prêmio marcado como pago.']);
    }

    if ($action === 'resultado_hist_registrar') {
        $data = adminNormalizeDate((string)($body['data_resultado'] ?? date('Y-m-d')));
        $praca = trim((string)($body['praca'] ?? 'Rio'));
        $loteria = trim((string)($body['loteria'] ?? ''));

        if ($loteria === '') {
            adminResponse(422, ['ok' => false, 'error' => 'Loteria obrigatória.']);
        }

        $ins = $pdo->prepare(
            "INSERT INTO resultados_historico (
                data_resultado, praca, loteria,
                payload_anterior, payload_novo,
                admin_id, admin_login, motivo, criado_em
            ) VALUES (
                :data_resultado, :praca, :loteria,
                :payload_anterior, :payload_novo,
                NULL, 'admin', :motivo, NOW()
            )"
        );
        $ins->execute([
            ':data_resultado' => $data,
            ':praca' => $praca,
            ':loteria' => $loteria,
            ':payload_anterior' => json_encode($body['payload_anterior'] ?? null, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':payload_novo' => json_encode($body['payload_novo'] ?? null, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':motivo' => trim((string)($body['motivo'] ?? 'Edição de resultado no painel admin.')),
        ]);

        adminResponse(200, ['ok' => true, 'message' => 'Histórico de resultado registrado.']);
    }

    adminResponse(404, ['ok' => false, 'error' => 'Ação administrativa inválida.']);
} catch (Throwable $e) {
    appendAsaasLog('admin_dashboard_api_erro', [
        'message' => $e->getMessage(),
        'line' => $e->getLine(),
        'file' => $e->getFile(),
    ]);

    $debug = isset($_GET['debug']) && trim((string)$_GET['debug']) === '1';
    $mensagem = 'Falha interna no dashboard admin.';
    $erroTxt = strtolower(trim($e->getMessage()));
    if (str_contains($erroTxt, 'duplicate entry') && str_contains($erroTxt, 'uq_usuarios_cpf')) {
        $mensagem = 'CPF já cadastrado em outro usuário.';
    } elseif (str_contains($erroTxt, 'duplicate entry') && str_contains($erroTxt, 'uq_usuarios_whatsapp')) {
        $mensagem = 'WhatsApp já cadastrado em outro usuário.';
    } elseif (str_contains($erroTxt, 'table') && str_contains($erroTxt, "doesn't exist")) {
        $mensagem = 'Tabela do banco ausente. Execute a atualização do schema/admin.';
    } elseif (str_contains($erroTxt, 'unknown column')) {
        $mensagem = 'Coluna do banco ausente. Execute a atualização do schema/admin.';
    }

    adminResponse(500, [
        'ok' => false,
        'error' => $mensagem,
        'debug' => $debug ? $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine() : null,
    ]);
}
