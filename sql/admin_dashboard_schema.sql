-- =====================================================
-- PORCO DO BICHO - SCHEMA ADMIN DASHBOARD
-- Compatível com MySQL 8+ / Hostinger
-- =====================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) NOT NULL DEFAULT 'apostador',
  ADD COLUMN IF NOT EXISTS promotor_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS indicador_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS comissao_percentual DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS bloqueado TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chave_pix VARCHAR(180) NULL,
  ADD COLUMN IF NOT EXISTS ultimo_login_em DATETIME NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios (perfil);
CREATE INDEX IF NOT EXISTS idx_usuarios_promotor_id ON usuarios (promotor_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_indicador_id ON usuarios (indicador_id);

CREATE TABLE IF NOT EXISTS promotores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  nome_exibicao VARCHAR(120) NULL,
  comissao_percentual DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  observacoes TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_promotores_usuario_id (usuario_id),
  KEY idx_promotores_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS indicacoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  indicador_usuario_id BIGINT UNSIGNED NOT NULL,
  indicado_usuario_id BIGINT UNSIGNED NOT NULL,
  origem VARCHAR(40) NOT NULL DEFAULT 'link',
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_indicacoes_indicado (indicado_usuario_id),
  KEY idx_indicacoes_indicador (indicador_usuario_id),
  KEY idx_indicacoes_origem (origem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comissoes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  promotor_usuario_id BIGINT UNSIGNED NOT NULL,
  apostador_usuario_id BIGINT UNSIGNED NULL,
  deposito_id BIGINT UNSIGNED NULL,
  referencia_tipo VARCHAR(40) NOT NULL DEFAULT 'deposito',
  referencia_id VARCHAR(120) NULL,
  base_valor DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  percentual DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  valor_comissao DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  pago_em DATETIME NULL,
  observacao TEXT NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_comissoes_promotor_status (promotor_usuario_id, status),
  KEY idx_comissoes_deposito (deposito_id),
  KEY idx_comissoes_criado (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS saques (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  chave_pix VARCHAR(180) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  observacao TEXT NULL,
  comprovante_url VARCHAR(255) NULL,
  aprovado_por_admin_id BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  pago_em DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_saques_usuario_status (usuario_id, status),
  KEY idx_saques_criado (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS movimentacoes_saldo (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo VARCHAR(30) NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  saldo_antes DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  saldo_depois DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  referencia_tipo VARCHAR(40) NULL,
  referencia_id VARCHAR(120) NULL,
  motivo VARCHAR(255) NULL,
  admin_responsavel_id BIGINT UNSIGNED NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mov_saldo_usuario (usuario_id, criado_em),
  KEY idx_mov_saldo_tipo (tipo, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS premios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  aposta_referencia VARCHAR(120) NULL,
  loteria VARCHAR(80) NULL,
  data_apuracao DATE NULL,
  valor_premio DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'apurado',
  pago_em DATETIME NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_premios_usuario_status (usuario_id, status),
  KEY idx_premios_data (data_apuracao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auditoria_admin (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admin_id BIGINT UNSIGNED NULL,
  admin_login VARCHAR(80) NULL,
  acao VARCHAR(80) NOT NULL,
  entidade VARCHAR(80) NOT NULL,
  entidade_id VARCHAR(120) NULL,
  valor_antigo LONGTEXT NULL,
  valor_novo LONGTEXT NULL,
  justificativa VARCHAR(255) NULL,
  ip VARCHAR(60) NULL,
  user_agent VARCHAR(255) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_auditoria_admin_acao (acao, criado_em),
  KEY idx_auditoria_admin_entidade (entidade, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resultados_historico (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  data_resultado DATE NOT NULL,
  praca VARCHAR(80) NOT NULL,
  loteria VARCHAR(80) NOT NULL,
  payload_anterior LONGTEXT NULL,
  payload_novo LONGTEXT NULL,
  admin_id BIGINT UNSIGNED NULL,
  admin_login VARCHAR(80) NULL,
  motivo VARCHAR(255) NULL,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_resultados_hist_data_loteria (data_resultado, loteria),
  KEY idx_resultados_hist_admin (admin_id, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
