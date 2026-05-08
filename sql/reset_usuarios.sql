-- ============================================================
-- RESET TOTAL DE USUÁRIOS (APAGA DADOS E RESETA AUTO_INCREMENT)
-- ============================================================
-- Use com cuidado: este script remove dados de usuários.

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE verificacoes_whatsapp;
TRUNCATE TABLE usuarios_pendentes;
TRUNCATE TABLE usuarios_temp;
TRUNCATE TABLE depositos;
TRUNCATE TABLE usuarios;

SET FOREIGN_KEY_CHECKS = 1;

-- Se desejar, insira novamente um admin manualmente após o reset.
-- Exemplo (ajuste os campos conforme sua tabela):
-- INSERT INTO usuarios (login, nome, senha, cpf_cnpj, whatsapp, whatsapp_verificado, saldo, status)
-- VALUES ('admin', 'Administrador', '<HASH_BCRYPT>', NULL, NULL, 1, 0.00, 'ATIVO');
