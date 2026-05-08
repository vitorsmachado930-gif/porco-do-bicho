<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if ($method !== 'POST') {
    jsonResponse(405, [
        'ok' => false,
        'error' => 'Método não permitido. Use POST.'
    ]);
}

function cadastroErro(string $mensagem, int $status = 422): void
{
    jsonResponse($status, [
        'ok' => false,
        'error' => $mensagem,
    ]);
}

try {
    $body = getJsonBody();

    $nome = trim((string)($body['nome'] ?? ''));
    $cpf = normalizeCpf11((string)($body['cpf'] ?? ''));
    $whatsapp = normalizeWhatsapp((string)($body['whatsapp'] ?? ''));
    $senha = trim((string)($body['senha'] ?? ''));

    if ($nome === '') {
        cadastroErro('Nome obrigatório.');
    }
    if ($cpf === '') {
        cadastroErro('CPF inválido. Informe 11 dígitos válidos.');
    }
    if ($whatsapp === '' || strlen($whatsapp) < 10) {
        cadastroErro('WhatsApp obrigatório com DDD (somente números).');
    }
    if (strlen($senha) < 6) {
        cadastroErro('Senha deve ter no mínimo 6 caracteres.');
    }

    $senhaHash = password_hash($senha, PASSWORD_DEFAULT);
    if (!is_string($senhaHash) || $senhaHash === '') {
        throw new RuntimeException('Falha ao gerar hash da senha.');
    }

    $pdo = db();
    ensureWalletSchemaSafely($pdo);

    // Duplicidade no cadastro definitivo.
    $qCpf = $pdo->prepare('SELECT id FROM usuarios WHERE cpf_cnpj = :cpf LIMIT 1');
    $qCpf->execute([':cpf' => $cpf]);
    if ($qCpf->fetch()) {
        cadastroErro('CPF já cadastrado.', 409);
    }

    $whatsappCol = hasColumn($pdo, 'usuarios', 'whatsapp') ? 'whatsapp' : (hasColumn($pdo, 'usuarios', 'telefone') ? 'telefone' : '');
    if ($whatsappCol !== '') {
        $qWhatsapp = $pdo->prepare("SELECT id FROM usuarios WHERE {$whatsappCol} = :whatsapp LIMIT 1");
        $qWhatsapp->execute([':whatsapp' => $whatsapp]);
        if ($qWhatsapp->fetch()) {
            cadastroErro('WhatsApp já cadastrado.', 409);
        }
    }

    $verificationRequired = whatsappVerificationEnabled();

    // Fluxo sem WhatsApp obrigatório (modo atual para colocar site no ar).
    if (!$verificationRequired) {
        $senhaColuna = hasColumn($pdo, 'usuarios', 'senha')
            ? 'senha'
            : (hasColumn($pdo, 'usuarios', 'senha_hash') ? 'senha_hash' : '');
        if ($senhaColuna === '') {
            throw new RuntimeException('Tabela usuarios sem coluna de senha compatível.');
        }

        $colunas = ['nome', 'cpf_cnpj', $senhaColuna];
        $valores = [':nome', ':cpf', ':senha'];
        $params = [
            ':nome' => $nome,
            ':cpf' => $cpf,
            ':senha' => $senhaHash,
        ];

        if ($whatsappCol !== '') {
            $colunas[] = $whatsappCol;
            $valores[] = ':whatsapp';
            $params[':whatsapp'] = $whatsapp;
        }

        if (hasColumn($pdo, 'usuarios', 'login')) {
            $colunas[] = 'login';
            $valores[] = ':login';
            $params[':login'] = $cpf;
        }

        if (hasColumn($pdo, 'usuarios', 'email')) {
            $colunas[] = 'email';
            $valores[] = ':email';
            $params[':email'] = '';
        }

        if (hasColumn($pdo, 'usuarios', 'saldo')) {
            $colunas[] = 'saldo';
            $valores[] = ':saldo';
            $params[':saldo'] = 0.00;
        }

        if (hasColumn($pdo, 'usuarios', 'whatsapp_verificado')) {
            $colunas[] = 'whatsapp_verificado';
            $valores[] = ':whatsapp_verificado';
            // Modo sem validação obrigatória: salva sem confirmação.
            $params[':whatsapp_verificado'] = 0;
        }

        if (hasColumn($pdo, 'usuarios', 'status')) {
            $colunas[] = 'status';
            $valores[] = ':status';
            $params[':status'] = 'ATIVO';
        }

        if (hasColumn($pdo, 'usuarios', 'created_at')) {
            $colunas[] = 'created_at';
            $valores[] = 'NOW()';
        }

        if (hasColumn($pdo, 'usuarios', 'updated_at')) {
            $colunas[] = 'updated_at';
            $valores[] = 'NOW()';
        }

        $sql = 'INSERT INTO usuarios (' . implode(', ', $colunas) . ') VALUES (' . implode(', ', $valores) . ')';
        $ins = $pdo->prepare($sql);
        $ins->execute($params);

        $novoId = (int)$pdo->lastInsertId();
        $novo = findUserById($pdo, $novoId);
        if (!is_array($novo)) {
            throw new RuntimeException('Falha ao carregar usuário criado.');
        }

        appendAsaasLog('cadastro_sem_whatsapp_ok', [
            'usuario_id' => $novoId,
            'cpf' => $cpf,
            'whatsapp' => $whatsapp,
        ]);

        jsonResponse(201, [
            'ok' => true,
            'pendente' => false,
            'whatsapp_verification_required' => false,
            'message' => 'Cadastro concluído com sucesso.',
            'usuario' => [
                'id' => $novoId,
                'nome' => (string)($novo['nome'] ?? $nome),
                'cpf_cnpj' => (string)($novo['cpf_cnpj'] ?? $cpf),
                'whatsapp' => (string)($novo['whatsapp'] ?? $novo['telefone'] ?? $whatsapp),
                'whatsapp_verificado' => (int)($novo['whatsapp_verificado'] ?? 0),
                'saldo' => number_format((float)($novo['saldo'] ?? 0), 2, '.', ''),
            ],
        ]);
    }

    // Fluxo com WhatsApp obrigatório.
    try {
        require_once __DIR__ . '/validar_codigo_core.php';
    } catch (Throwable $e) {
        appendAsaasLog('whatsapp_codigo_erro', [
            'erro_include_core' => $e->getMessage(),
        ]);
        cadastroErro('Falha interna ao carregar validação de WhatsApp.', 500);
    }

    usuariosTempCleanup($pdo);
    $tabelaPendentes = getPendingUsersTable($pdo);

    $qTempCpf = $pdo->prepare(
        "SELECT id
         FROM {$tabelaPendentes}
         WHERE cpf_cnpj = :cpf
           AND verificado = 0
         LIMIT 1"
    );
    $qTempCpf->execute([':cpf' => $cpf]);
    if ($qTempCpf->fetch()) {
        cadastroErro('Já existe cadastro pendente para este CPF. Confirme o código recebido no WhatsApp.', 409);
    }

    $qTempWhatsapp = $pdo->prepare(
        "SELECT id
         FROM {$tabelaPendentes}
         WHERE whatsapp = :whatsapp
           AND verificado = 0
         LIMIT 1"
    );
    $qTempWhatsapp->execute([':whatsapp' => $whatsapp]);
    if ($qTempWhatsapp->fetch()) {
        cadastroErro('Já existe cadastro pendente para este WhatsApp. Confirme o código recebido.', 409);
    }

    $codigo = usuariosTempCodigoAleatorio(6);

    $insTemp = $pdo->prepare(
        "INSERT INTO {$tabelaPendentes} (
            nome,
            cpf_cnpj,
            whatsapp,
            senha_hash,
            codigo_verificacao,
            expira_em,
            tentativas,
            verificado,
            criado_em,
            atualizado_em
        ) VALUES (
            :nome,
            :cpf,
            :whatsapp,
            :senha_hash,
            :codigo,
            DATE_ADD(NOW(), INTERVAL 5 MINUTE),
            0,
            0,
            NOW(),
            NOW()
        )"
    );
    $insTemp->execute([
        ':nome' => $nome,
        ':cpf' => $cpf,
        ':whatsapp' => $whatsapp,
        ':senha_hash' => $senhaHash,
        ':codigo' => $codigo,
    ]);

    $tempId = (int)$pdo->lastInsertId();

    appendAsaasLog('cadastro_pendente_criado', [
        'cadastro_temp_id' => $tempId,
        'cpf' => $cpf,
        'whatsapp' => $whatsapp,
    ]);

    $enviado = sendWhatsappCode($whatsapp, $codigo);
    if (!$enviado) {
        $del = $pdo->prepare("DELETE FROM {$tabelaPendentes} WHERE id = :id LIMIT 1");
        $del->execute([':id' => $tempId]);

        appendAsaasLog('whatsapp_codigo_erro', [
            'cadastro_temp_id' => $tempId,
            'cpf' => $cpf,
            'whatsapp' => $whatsapp,
        ]);

        cadastroErro('Falha ao enviar código no WhatsApp. Verifique a configuração do provedor.', 502);
    }

    appendAsaasLog('whatsapp_codigo_enviado', [
        'cadastro_temp_id' => $tempId,
        'cpf' => $cpf,
        'whatsapp' => $whatsapp,
    ]);

    jsonResponse(201, [
        'ok' => true,
        'pendente' => true,
        'whatsapp_verification_required' => true,
        'message' => 'Cadastro pendente. Confirme o código do WhatsApp para concluir sua conta.',
        'usuario' => [
            'id' => $tempId,
            'nome' => $nome,
            'cpf_cnpj' => $cpf,
            'whatsapp' => $whatsapp,
            'whatsapp_verificado' => 0,
            'saldo' => '0.00',
        ],
        'cadastro_temp_id' => $tempId,
        'expira_em_minutos' => 5,
    ]);
} catch (PDOException $e) {
    $msg = strtolower((string)$e->getMessage());
    if (
        str_contains($msg, 'uq_usuarios_temp_cpf') ||
        str_contains($msg, 'uq_usuarios_pendentes_cpf') ||
        (str_contains($msg, 'duplicate') && str_contains($msg, 'cpf'))
    ) {
        cadastroErro('CPF já possui cadastro pendente.', 409);
    }
    if (
        str_contains($msg, 'uq_usuarios_temp_whatsapp') ||
        str_contains($msg, 'uq_usuarios_pendentes_whatsapp') ||
        (str_contains($msg, 'duplicate') && str_contains($msg, 'whatsapp'))
    ) {
        cadastroErro('WhatsApp já possui cadastro pendente.', 409);
    }

    appendAsaasLog('cadastro_erro', [
        'message' => $e->getMessage(),
        'code' => (string)$e->getCode(),
        'type' => 'PDOException',
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Erro interno no cadastro.',
        'debug' => $e->getMessage(),
    ]);
} catch (Throwable $e) {
    appendAsaasLog('cadastro_erro', [
        'message' => $e->getMessage(),
        'code' => (string)$e->getCode(),
        'type' => get_class($e),
    ]);

    jsonResponse(500, [
        'ok' => false,
        'error' => 'Erro interno no cadastro.',
        'debug' => $e->getMessage(),
    ]);
}
