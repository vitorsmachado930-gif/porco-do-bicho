# Carteira Segura (SQL + Asaas)

Este projeto agora inclui uma estrutura de carteira segura com:

- tabela `usuarios` (com campo `saldo`)
- tabela `depositos` (controle de status e rastreabilidade)
- criação de depósito `PENDENTE`
- crédito de saldo apenas no webhook de pagamento confirmado
- proteção contra crédito duplicado
- API Key somente no backend

## 1) Importar schema SQL

Importe o arquivo:

- `sql/carteira_schema.sql`

No banco MySQL da hospedagem.

## 2) Configurar segredos no servidor

No servidor, crie o arquivo:

- `api/wallet_secrets.php`

Use como base:

- `api/wallet_secrets.example.php`

Preencha:

- `db_host`, `db_port`, `db_name`, `db_user`, `db_pass`
- `asaas_base_url` (`https://api-sandbox.asaas.com/v3` ou `https://api.asaas.com/v3`)
- `asaas_api_key`
- `asaas_webhook_token`
- `pix_due_days`

> Nunca coloque API Key no frontend.

## 3) Cadastrar webhook no Asaas

URL do webhook:

- `https://SEU_DOMINIO.com/api/carteira_webhook_asaas.php`

Evento mínimo:

- `PAYMENT_RECEIVED`

Token do webhook no painel Asaas:

- use o mesmo valor de `asaas_webhook_token`.

## 4) Endpoints criados

- `POST /api/carteira_usuario_upsert.php`
- `GET /api/carteira_saldo_usuario.php?login=...`
- `POST /api/carteira_deposito_criar.php`
- `GET /api/carteira_deposito_status.php?ref=...`
- `POST /api/carteira_webhook_asaas.php`

## 5) Fluxo de crédito de saldo

1. Frontend cria depósito (`PENDENTE`) e recebe QR PIX.
2. Usuário paga o PIX.
3. Asaas chama webhook `PAYMENT_RECEIVED`.
4. Backend credita `usuarios.saldo` e marca depósito como `PAGO`.

## 6) Anti-duplicidade

A prevenção de crédito duplicado acontece por:

- atualização com `SELECT ... FOR UPDATE` na linha do depósito
- validação de status (`PAGO` não credita novamente)
- chave única `provider_event_id`
- chave única `provider_payment_id`

## 7) Observação importante sobre o sistema atual

O site ainda tem partes legadas usando `localStorage` para saldo/apostas.
A carteira SQL foi preparada de forma segura no backend.
Para operação real total, o próximo passo é migrar leitura/escrita de saldo e apostas para backend SQL.
