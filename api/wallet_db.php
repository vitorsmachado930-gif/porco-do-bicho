<?php
declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'wallet_config.php';

function walletPdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    walletValidarConfiguracaoMinima(false);
    $cfg = walletConfig();

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $cfg['db_host'],
        (int)$cfg['db_port'],
        $cfg['db_name']
    );

    $pdo = new PDO(
        $dsn,
        $cfg['db_user'],
        $cfg['db_pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    return $pdo;
}

function walletTabelaTemColuna(PDO $pdo, string $tabela, string $coluna): bool
{
    $stmt = $pdo->prepare(
        'SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :tabela
           AND COLUMN_NAME = :coluna
         LIMIT 1'
    );
    $stmt->execute([
        ':tabela' => $tabela,
        ':coluna' => $coluna,
    ]);
    return (bool)$stmt->fetchColumn();
}

function walletGarantirTabelaUsuarios(PDO $pdo): void
{
    $sqlCreate = <<<SQL
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login VARCHAR(80) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(120) NULL,
  telefone VARCHAR(20) NULL,
  cpf_cnpj VARCHAR(18) NULL,
  asaas_customer_id VARCHAR(32) NULL,
  saldo DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status ENUM('ATIVO','BLOQUEADO') NOT NULL DEFAULT 'ATIVO',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_login (login),
  UNIQUE KEY uq_usuarios_asaas_customer_id (asaas_customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
SQL;
    $pdo->exec($sqlCreate);

    // Compatibilidade com bases antigas: adiciona colunas que podem estar ausentes.
    $colunas = [
        'login' => "ALTER TABLE usuarios ADD COLUMN login VARCHAR(80) NOT NULL DEFAULT '' FIRST",
        'nome' => "ALTER TABLE usuarios ADD COLUMN nome VARCHAR(120) NOT NULL DEFAULT 'Usuário' AFTER login",
        'email' => "ALTER TABLE usuarios ADD COLUMN email VARCHAR(120) NULL AFTER nome",
        'telefone' => "ALTER TABLE usuarios ADD COLUMN telefone VARCHAR(20) NULL AFTER email",
        'cpf_cnpj' => "ALTER TABLE usuarios ADD COLUMN cpf_cnpj VARCHAR(18) NULL AFTER telefone",
        'asaas_customer_id' => "ALTER TABLE usuarios ADD COLUMN asaas_customer_id VARCHAR(64) NULL AFTER cpf_cnpj",
        'saldo' => "ALTER TABLE usuarios ADD COLUMN saldo DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER asaas_customer_id",
        'status' => "ALTER TABLE usuarios ADD COLUMN status ENUM('ATIVO','BLOQUEADO') NOT NULL DEFAULT 'ATIVO' AFTER saldo",
        'created_at' => "ALTER TABLE usuarios ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
        'updated_at' => "ALTER TABLE usuarios ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    ];
    foreach ($colunas as $nomeColuna => $sqlAlter) {
        if (!walletTabelaTemColuna($pdo, 'usuarios', $nomeColuna)) {
            $pdo->exec($sqlAlter);
        }
    }

    // Garante índice único de login quando ainda não existir.
    $idxStmt = $pdo->query("SHOW INDEX FROM usuarios WHERE Key_name = 'uq_usuarios_login'");
    $idxExiste = $idxStmt && $idxStmt->fetch();
    if (!$idxExiste) {
        $pdo->exec("ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_login (login)");
    }
}
