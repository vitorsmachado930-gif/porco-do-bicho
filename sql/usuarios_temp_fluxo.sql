-- ============================================================
-- FLUXO DE CADASTRO PENDENTE VIA WHATSAPP (MySQL 8+)
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios_pendentes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(120) NOT NULL,
  cpf_cnpj VARCHAR(18) NOT NULL,
  whatsapp VARCHAR(20) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  codigo_verificacao VARCHAR(6) NOT NULL,
  expira_em DATETIME NOT NULL,
  tentativas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  verificado TINYINT(1) NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_pendentes_cpf (cpf_cnpj),
  UNIQUE KEY uq_usuarios_pendentes_whatsapp (whatsapp),
  KEY idx_usuarios_pendentes_expira (expira_em),
  KEY idx_usuarios_pendentes_verificado (verificado, expira_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Limpeza recomendada de cadastros expirados e pendências antigas verificadas.
DELETE FROM usuarios_pendentes
WHERE (verificado = 0 AND expira_em < NOW())
   OR (verificado = 1 AND atualizado_em < (NOW() - INTERVAL 1 DAY));
