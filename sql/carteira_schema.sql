-- Estrutura segura de carteira
-- MySQL 8+

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login VARCHAR(80) NOT NULL,
  nome VARCHAR(120) NOT NULL,
  email VARCHAR(120) NULL,
  telefone VARCHAR(20) NULL,
  cpf_cnpj VARCHAR(18) NULL,
  asaas_customer_id VARCHAR(32) NULL,
  saldo DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status ENUM('ATIVO', 'BLOQUEADO') NOT NULL DEFAULT 'ATIVO',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_login (login),
  UNIQUE KEY uq_usuarios_asaas_customer_id (asaas_customer_id),
  KEY idx_usuarios_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS depositos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  reference_id VARCHAR(64) NOT NULL,
  provider ENUM('ASAAS') NOT NULL DEFAULT 'ASAAS',
  provider_payment_id VARCHAR(64) NULL,
  provider_event_id VARCHAR(96) NULL,
  valor DECIMAL(14,2) NOT NULL,
  status ENUM('PENDENTE', 'PAGO', 'CANCELADO', 'EXPIRADO', 'FALHOU') NOT NULL DEFAULT 'PENDENTE',
  qr_code_base64 LONGTEXT NULL,
  pix_copia_cola TEXT NULL,
  expires_at DATETIME NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_depositos_reference_id (reference_id),
  UNIQUE KEY uq_depositos_provider_payment_id (provider_payment_id),
  UNIQUE KEY uq_depositos_provider_event_id (provider_event_id),
  KEY idx_depositos_usuario_status (usuario_id, status),
  KEY idx_depositos_created_at (created_at),
  CONSTRAINT fk_depositos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS carteira_apostas_debitos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  referencia VARCHAR(120) NOT NULL,
  valor DECIMAL(14,2) NOT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carteira_apostas_debitos_referencia (referencia),
  KEY idx_carteira_apostas_debitos_usuario (usuario_id),
  CONSTRAINT fk_carteira_apostas_debitos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
