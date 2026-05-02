-- =====================================================
-- BANCO.SQL - ESTRUTURA MINIMA PARA CARTEIRA + DEPOSITOS
-- =====================================================
-- Compatível com MySQL 8+ (Hostinger)

-- Cria tabela de usuarios (com saldo).
CREATE TABLE IF NOT EXISTS usuarios (
  -- ID interno do usuario.
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Login unico para identificar usuario.
  login VARCHAR(80) NOT NULL,

  -- Nome do usuario.
  nome VARCHAR(120) NOT NULL,

  -- Email (opcional).
  email VARCHAR(120) NULL,

  -- Telefone (opcional).
  telefone VARCHAR(20) NULL,

  -- CPF ou CNPJ (necessario para criar customer no Asaas).
  cpf_cnpj VARCHAR(18) NULL,

  -- ID do cliente no Asaas (cus_xxx).
  asaas_customer_id VARCHAR(32) NULL,

  -- Saldo em reais (2 casas decimais).
  saldo DECIMAL(14,2) NOT NULL DEFAULT 0.00,

  -- Status de uso da conta.
  status ENUM('ATIVO','BLOQUEADO') NOT NULL DEFAULT 'ATIVO',

  -- Data de criacao.
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Data de atualizacao.
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Chave primaria.
  PRIMARY KEY (id),

  -- Login unico.
  UNIQUE KEY uq_usuarios_login (login),

  -- Customer Asaas unico (quando existir).
  UNIQUE KEY uq_usuarios_asaas_customer_id (asaas_customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cria tabela de depositos.
CREATE TABLE IF NOT EXISTS depositos (
  -- ID interno do deposito.
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Usuario dono do deposito.
  usuario_id BIGINT UNSIGNED NOT NULL,

  -- Referencia externa da cobranca (externalReference no Asaas).
  external_reference VARCHAR(80) NOT NULL,

  -- ID da cobranca no Asaas (pay_xxx).
  asaas_payment_id VARCHAR(64) NULL,

  -- ID do evento webhook no Asaas (evt_xxx).
  asaas_event_id VARCHAR(96) NULL,

  -- Ultimo evento recebido (ex: PAYMENT_RECEIVED).
  ultimo_evento VARCHAR(64) NULL,

  -- Valor do deposito.
  valor DECIMAL(14,2) NOT NULL,

  -- Status local do deposito.
  status ENUM('PENDENTE','PAGO','CANCELADO','EXPIRADO','FALHOU') NOT NULL DEFAULT 'PENDENTE',

  -- QR code em base64 retornado pelo Asaas.
  qr_code_base64 LONGTEXT NULL,

  -- Payload copia e cola do Pix.
  pix_copia_cola TEXT NULL,

  -- Expiracao da cobranca.
  expires_at DATETIME NULL,

  -- Momento que foi pago (somente quando webhook confirmar).
  pago_em DATETIME NULL,

  -- Data de criacao local.
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Data de atualizacao local.
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Chave primaria.
  PRIMARY KEY (id),

  -- externalReference unico por deposito.
  UNIQUE KEY uq_depositos_external_reference (external_reference),

  -- payment id unico para evitar cadastro duplicado da mesma cobranca.
  UNIQUE KEY uq_depositos_asaas_payment_id (asaas_payment_id),

  -- event id unico para ajudar idempotencia por webhook.
  UNIQUE KEY uq_depositos_asaas_event_id (asaas_event_id),

  -- Indice de consulta por usuario e status.
  KEY idx_depositos_usuario_status (usuario_id, status),

  -- Chave estrangeira para usuarios.
  CONSTRAINT fk_depositos_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- DADO INICIAL DE TESTE (OPCIONAL)
-- =====================================================
-- Troque os dados conforme seu ambiente.
INSERT INTO usuarios (login, nome, email, telefone, cpf_cnpj, saldo, status)
VALUES ('teste', 'Usuario Teste', 'teste@exemplo.com', '11999999999', '12345678901', 0.00, 'ATIVO')
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome),
  email = VALUES(email),
  telefone = VALUES(telefone),
  cpf_cnpj = VALUES(cpf_cnpj),
  status = VALUES(status);
