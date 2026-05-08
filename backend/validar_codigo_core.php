<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function usuariosTempCleanup(PDO $pdo): void
{
    $tabela = getPendingUsersTable($pdo);
    // Remove pendências expiradas e verificadas antigas.
    $pdo->exec("DELETE FROM {$tabela} WHERE (verificado = 0 AND expira_em < NOW()) OR (verificado = 1 AND atualizado_em < (NOW() - INTERVAL 1 DAY))");
}

function usuariosTempCodigoAleatorio(int $digits = 6): string
{
    $max = (10 ** max(4, min(8, $digits))) - 1;
    $num = random_int(0, $max);
    return str_pad((string)$num, max(4, min(8, $digits)), '0', STR_PAD_LEFT);
}

function usuariosTempGetRowById(PDO $pdo, int $tempId): ?array
{
    $tabela = getPendingUsersTable($pdo);
    $stmt = $pdo->prepare("SELECT * FROM {$tabela} WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $tempId]);
    $row = $stmt->fetch();
    return is_array($row) ? $row : null;
}

function usuariosTempExisteCpfDefinitivo(PDO $pdo, string $cpf): bool
{
    $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE cpf_cnpj = :cpf LIMIT 1');
    $stmt->execute([':cpf' => $cpf]);
    return (bool)$stmt->fetch();
}

function usuariosTempExisteWhatsappDefinitivo(PDO $pdo, string $whatsapp): bool
{
    $col = hasColumn($pdo, 'usuarios', 'whatsapp') ? 'whatsapp' : (hasColumn($pdo, 'usuarios', 'telefone') ? 'telefone' : '');
    if ($col === '') {
        return false;
    }

    $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE {$col} = :whatsapp LIMIT 1");
    $stmt->execute([':whatsapp' => $whatsapp]);
    return (bool)$stmt->fetch();
}

function usuariosDefinitivoInsertFromTemp(PDO $pdo, array $tempRow): array
{
    $nome = trim((string)($tempRow['nome'] ?? ''));
    $cpf = normalizeCpf11((string)($tempRow['cpf_cnpj'] ?? ''));
    $whatsapp = normalizeWhatsapp((string)($tempRow['whatsapp'] ?? ''));
    $senhaHash = (string)($tempRow['senha_hash'] ?? '');

    if ($nome === '' || $cpf === '' || $whatsapp === '' || $senhaHash === '') {
        throw new RuntimeException('Dados temporários inválidos para criação do usuário definitivo.');
    }

    $senhaColuna = hasColumn($pdo, 'usuarios', 'senha')
        ? 'senha'
        : (hasColumn($pdo, 'usuarios', 'senha_hash') ? 'senha_hash' : '');
    if ($senhaColuna === '') {
        throw new RuntimeException('Tabela usuarios sem coluna de senha.');
    }

    $whatsappColuna = hasColumn($pdo, 'usuarios', 'whatsapp')
        ? 'whatsapp'
        : (hasColumn($pdo, 'usuarios', 'telefone') ? 'telefone' : '');
    if ($whatsappColuna === '') {
        throw new RuntimeException('Tabela usuarios sem coluna de WhatsApp/telefone.');
    }

    $insertColumns = ['nome', 'cpf_cnpj', $whatsappColuna, $senhaColuna];
    $insertValues = [':nome', ':cpf', ':whatsapp', ':senha'];
    $params = [
        ':nome' => $nome,
        ':cpf' => $cpf,
        ':whatsapp' => $whatsapp,
        ':senha' => $senhaHash,
    ];

    if (hasColumn($pdo, 'usuarios', 'login')) {
        $insertColumns[] = 'login';
        $insertValues[] = ':login';
        $params[':login'] = $cpf;
    }
    if (hasColumn($pdo, 'usuarios', 'email')) {
        $insertColumns[] = 'email';
        $insertValues[] = ':email';
        $params[':email'] = '';
    }
    if (hasColumn($pdo, 'usuarios', 'saldo')) {
        $insertColumns[] = 'saldo';
        $insertValues[] = ':saldo';
        $params[':saldo'] = 0.00;
    }
    if (hasColumn($pdo, 'usuarios', 'whatsapp_verificado')) {
        $insertColumns[] = 'whatsapp_verificado';
        $insertValues[] = ':whatsapp_verificado';
        $params[':whatsapp_verificado'] = 1;
    }
    if (hasColumn($pdo, 'usuarios', 'status')) {
        $insertColumns[] = 'status';
        $insertValues[] = ':status';
        $params[':status'] = 'ATIVO';
    }
    if (hasColumn($pdo, 'usuarios', 'created_at')) {
        $insertColumns[] = 'created_at';
        $insertValues[] = 'NOW()';
    }
    if (hasColumn($pdo, 'usuarios', 'updated_at')) {
        $insertColumns[] = 'updated_at';
        $insertValues[] = 'NOW()';
    }

    $sql = 'INSERT INTO usuarios (' . implode(', ', $insertColumns) . ') VALUES (' . implode(', ', $insertValues) . ')';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $id = (int)$pdo->lastInsertId();
    $stmtUser = $pdo->prepare('SELECT * FROM usuarios WHERE id = :id LIMIT 1');
    $stmtUser->execute([':id' => $id]);
    $user = $stmtUser->fetch();
    if (!is_array($user)) {
        throw new RuntimeException('Falha ao carregar usuário definitivo criado.');
    }

    return $user;
}

function validarCodigoUsuariosTemp(PDO $pdo, int $tempId, string $codigo): array
{
    if ($tempId <= 0) {
        throw new InvalidArgumentException('ID temporário inválido.');
    }
    if (strlen(onlyDigits($codigo)) < 4) {
        throw new InvalidArgumentException('Código inválido.');
    }

    usuariosTempCleanup($pdo);

    $tabela = getPendingUsersTable($pdo);
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            "SELECT *
             FROM {$tabela}
             WHERE id = :id
               AND verificado = 0
             LIMIT 1
             FOR UPDATE"
        );
        $stmt->execute([':id' => $tempId]);
        $temp = $stmt->fetch();
        if (!is_array($temp)) {
            throw new RuntimeException('Cadastro pendente não encontrado ou já confirmado.');
        }

        $agora = new DateTimeImmutable('now');
        $expiraEm = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)($temp['expira_em'] ?? ''));
        if (!$expiraEm || $expiraEm < $agora) {
            $pdo->rollBack();
            throw new RuntimeException('Código expirado. Solicite um novo código.');
        }

        $codigoDb = onlyDigits((string)($temp['codigo_verificacao'] ?? ''));
        if (!hash_equals($codigoDb, onlyDigits($codigo))) {
            $upTent = $pdo->prepare("UPDATE {$tabela} SET tentativas = tentativas + 1 WHERE id = :id LIMIT 1");
            $upTent->execute([':id' => $tempId]);
            $pdo->commit();
            throw new RuntimeException('Código inválido.');
        }

        $cpf = normalizeCpf11((string)$temp['cpf_cnpj']);
        $whatsapp = normalizeWhatsapp((string)$temp['whatsapp']);
        if (usuariosTempExisteCpfDefinitivo($pdo, $cpf)) {
            $pdo->rollBack();
            throw new RuntimeException('CPF já cadastrado.');
        }
        if (usuariosTempExisteWhatsappDefinitivo($pdo, $whatsapp)) {
            $pdo->rollBack();
            throw new RuntimeException('WhatsApp já cadastrado.');
        }

        $user = usuariosDefinitivoInsertFromTemp($pdo, $temp);

        $updTemp = $pdo->prepare(
            "UPDATE {$tabela}
             SET verificado = 1, codigo_verificacao = ""
             WHERE id = :id
             LIMIT 1"
        );
        $updTemp->execute([':id' => $tempId]);

        $pdo->commit();
        return $user;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}
