<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_common.php';
require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_db.php';

function carteiraGarantirTabelaDebitosAposta(PDO $pdo): void
{
    $sql = <<<SQL
CREATE TABLE IF NOT EXISTS carteira_apostas_debitos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  referencia VARCHAR(120) NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  metadata_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carteira_apostas_debitos_referencia (referencia),
  KEY idx_carteira_apostas_debitos_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
    $pdo->exec($sql);
}

walletTratarPreflight();
walletValidarMetodo('POST');
walletValidarClienteWeb();
walletAplicarRateLimit('carteira-apostar', 80, 60);

try {
    walletValidarConfiguracaoMinima(false);
    $pdo = walletPdo();
    walletGarantirTabelaUsuarios($pdo);
    carteiraGarantirTabelaDebitosAposta($pdo);

    $payload = walletBodyJson();
    $login = walletNormalizarLogin((string)($payload['login'] ?? ''));
    $referencia = trim((string)($payload['referencia'] ?? ''));
    $valor = walletNormalizarValor($payload['valor'] ?? 0);
    $detalhes = isset($payload['detalhes']) && is_array($payload['detalhes']) ? $payload['detalhes'] : [];

    if ($login === '') {
        walletResponder(422, ['ok' => false, 'error' => 'Login obrigatorio.']);
    }

    if ($referencia === '' || strlen($referencia) < 8 || strlen($referencia) > 120) {
        walletResponder(422, ['ok' => false, 'error' => 'Referencia de debito invalida.']);
    }

    if ($valor <= 0) {
        walletResponder(422, ['ok' => false, 'error' => 'Valor de aposta invalido.']);
    }

    $pdo->beginTransaction();

    $stmtUsuario = $pdo->prepare(
        'SELECT id, login, saldo, status
         FROM usuarios
         WHERE login = :login
         LIMIT 1
         FOR UPDATE'
    );
    $stmtUsuario->execute([':login' => $login]);
    $usuario = $stmtUsuario->fetch();

    if (!$usuario) {
        $pdo->rollBack();
        walletResponder(404, ['ok' => false, 'error' => 'Usuario nao encontrado na carteira.']);
    }

    if (strtoupper((string)$usuario['status']) !== 'ATIVO') {
        $pdo->rollBack();
        walletResponder(403, ['ok' => false, 'error' => 'Usuario bloqueado para apostar.']);
    }

    $stmtDebitoExiste = $pdo->prepare(
        'SELECT id, usuario_id, valor, referencia
         FROM carteira_apostas_debitos
         WHERE referencia = :referencia
         LIMIT 1
         FOR UPDATE'
    );
    $stmtDebitoExiste->execute([':referencia' => $referencia]);
    $debitoExistente = $stmtDebitoExiste->fetch();

    if ($debitoExistente) {
        $saldoAtual = (float)$usuario['saldo'];
        $pdo->commit();
        walletResponder(200, [
            'ok' => true,
            'alreadyProcessed' => true,
            'saldoAnterior' => $saldoAtual,
            'saldoAtual' => $saldoAtual,
        ]);
    }

    $saldoAnterior = (float)$usuario['saldo'];
    if ($valor > $saldoAnterior) {
        $pdo->rollBack();
        walletResponder(422, [
            'ok' => false,
            'error' => 'Saldo insuficiente para aposta.',
            'saldoAtual' => $saldoAnterior,
            'valorDebito' => $valor,
        ]);
    }

    $saldoAtual = (float)number_format($saldoAnterior - $valor, 2, '.', '');

    $stmtDebitar = $pdo->prepare(
        'UPDATE usuarios
         SET saldo = :saldoAtual
         WHERE id = :id
         LIMIT 1'
    );
    $stmtDebitar->execute([
        ':saldoAtual' => $saldoAtual,
        ':id' => (int)$usuario['id'],
    ]);

    $metadataJson = null;
    if (!empty($detalhes)) {
        $jsonTmp = json_encode($detalhes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (is_string($jsonTmp) && $jsonTmp !== '') {
            $metadataJson = $jsonTmp;
        }
    }

    $stmtInserirDebito = $pdo->prepare(
        'INSERT INTO carteira_apostas_debitos (
            usuario_id,
            referencia,
            valor,
            metadata_json,
            created_at
         ) VALUES (
            :usuarioId,
            :referencia,
            :valor,
            :metadata,
            NOW()
         )'
    );
    $stmtInserirDebito->execute([
        ':usuarioId' => (int)$usuario['id'],
        ':referencia' => $referencia,
        ':valor' => $valor,
        ':metadata' => $metadataJson,
    ]);

    $pdo->commit();

    walletResponder(200, [
        'ok' => true,
        'alreadyProcessed' => false,
        'saldoAnterior' => $saldoAnterior,
        'saldoAtual' => $saldoAtual,
        'valorDebitado' => $valor,
    ]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $msg = 'Falha ao debitar aposta no servidor.';
    if ($e instanceof PDOException) {
        $sqlState = (string)($e->getCode() ?? '');
        if ($sqlState === '42S02') {
            $msg = 'Falha ao debitar aposta: tabela de carteira nao encontrada.';
        } elseif ($sqlState === '42S22') {
            $msg = 'Falha ao debitar aposta: coluna ausente em tabela da carteira.';
        }
    }
    walletResponder(500, [
        'ok' => false,
        'error' => $msg,
    ]);
}
