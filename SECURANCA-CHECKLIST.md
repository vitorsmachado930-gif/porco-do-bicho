# Checklist de Seguranca (Prioridade)

## Aplicado neste projeto
- Headers de seguranca em `api/resultados.php` e `api/painel.php`.
- CORS restrito para `https://www.porcodobicho.com` e `https://porcodobicho.com`.
- Bloqueio de escrita remota por origem/referer invalido.
- Validacao de `X-Requested-With` para reduzir abuso automatizado simples.
- Rate limit por IP em rotas `POST` da API.
- Bloqueio de acesso web direto em `storage/` (protecao dos JSON internos).
- Hardening do Apache em `.htaccess` (CSP, nosniff, frame deny, etc.).

## Proximo passo (alta prioridade)
1. Migrar login de usuarios para backend com senha hasheada (`password_hash`).
2. Remover qualquer senha em texto puro de JSON/localStorage.
3. Criar sessao real com cookie `HttpOnly`, `Secure`, `SameSite=Strict`.
4. Exigir token CSRF em todas as operacoes sensiveis (`POST` de aposta/deposito/admin).
5. Separar permissao de usuario comum vs admin no backend.

## Proximo passo (media prioridade)
1. Mover `api/*.php` para rotas protegidas por WAF/Cloudflare.
2. Ativar Turnstile/reCAPTCHA no login, cadastro e deposito.
3. Adicionar logs de auditoria (login, deposito, aposta, alteracao admin).
4. Limitar tentativas de login por IP + login (anti brute-force).
5. Criar backup automatico externo (diario + retencao).

## Marca e anti-clone
1. Registrar marca e elementos visuais no INPI.
2. Adicionar pagina oficial de verificacao de dominio para usuarios.
3. Comprar dominios parecidos para evitar phishing.
4. Ativar SPF, DKIM e DMARC no e-mail do dominio.
