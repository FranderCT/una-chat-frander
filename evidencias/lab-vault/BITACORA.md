# Bitácora – Laboratorio 8: Client Secret de Auth0 en Supabase Vault

Horas en America/Costa_Rica (UTC-6), viernes 06-nov-2026. Ningún valor sensible aparece en este documento ni en las capturas
(Client Secret, contraseña del rol, `VAULT_DATABASE_URL` y Deploy Hook quedan fuera de Git; los valores en Render están enmascarados).

| Dato | Valor |
|---|---|
| Proyecto Supabase | `una-chat-lab`, ref `yvjzwchznmnezqamawow`, región `ca-central-1`, PostgreSQL 17.11 |
| Tenant Auth0 | `dev-atpizsyofeuoutpc.us.auth0.com`, app **UNA Chat** |
| Servicio Render | `https://una-chat-frander.onrender.com` (plan Free, Docker) |
| Commit desplegado | `8f12d6c` (rama `main`) |

## Bitácora por etapa

| Hora | Etapa | Resultado |
|---|---|---|
| ≈17:30 | Preparación | Proyecto de prueba `una-chat-lab` creado en Supabase; tenant y app creados en Auth0. |
| 17:43 | 1. Vault | Secreto `una_chat_auth0_client_secret` creado desde Integrations → Vault (longitud 64). Captura 01. |
| ≈17:50 | 2. Acceso | Rol `una_chat_backend` creado y script `una_chat_vault_access.sql` ejecutado: **Success**. |
| 17:55 / 18:34–18:37 | 2. Bloqueo | `anon` y `authenticated` reciben **42501** al llamar la función; `anon` recibe **42501** al leer `vault.decrypted_secrets`. Capturas 02–05. |
| 17:56 / 18:37 | 3. Lectura del servidor | Con el rol de backend `secret_length = 64` (> 16). Captura 06. |
| 17:56 / 18:37 | 3. Membresía | Ver *Desviación 1*: `dashboard_is_member = true` pero `dashboard_can_use_role = false`. Captura 07. |
| ≈18:00 | 4. Auth0 | Application Type **Regular Web Application**, método **Client Secret (Post)**, tres callbacks + logout + web origins. Capturas 12–14. |
| 17:5x | 5. Local | `node server.js`: lee Vault (64) y la prueba de arranque devuelve `invalid_grant` (esperado). |
| 18:05 | 6. Despliegue | Render **Live** con commit `8f12d6c` (First Deploy). Captura 16. |
| 18:10 | 6. Antes del login | `GET /auth/config` → 200 (`enabled:true`, dominio y Client ID, sin secreto); `GET /sala` → 401; `GET /auth/login` → 302 a Auth0. |
| 18:27:49 | 6. Primer login | Ventana privada: se ve el nombre y **Cerrar sesión**. Captura 10. |
| — | 7. Variable anterior | Render nunca tuvo `AUTH0_CLIENT_SECRET`: la lista final contiene solo `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `APP_BASE_URL`, `VAULT_DATABASE_URL`, `SESSION_SECRET`. Captura 15. |
| 18:29:15 | 8. Rotación | Client Secret rotado en Auth0 (el hash del nuevo difiere del anterior). |
| 18:30:05 | 8. Vault | `vault.update_secret(...)` ejecutado; Vault contiene el valor nuevo (comprobado por md5, sin mostrarlo). |
| 18:31:35 | 8. Redeploy | Manual Deploy en Render (commit `8f12d6c`); arranque 18:31:55: lee Vault y la prueba da `invalid_grant`. |
| 18:32:37 | 8. Login nuevo | Ventana privada nueva: llega a la sala. `GET /sala` sin cookie → 401 (18:33:01). Captura 11. |

## Comparación del secreto anterior contra el nuevo (`POST https://dev-atpizsyofeuoutpc.us.auth0.com/oauth/token`)

Cuerpo `application/x-www-form-urlencoded`: `grant_type=authorization_code`, `client_id`, `client_secret` (único campo que cambia),
`code=vault-startup-probe`, `redirect_uri=https://una-chat-frander.onrender.com/auth/callback`, `code_verifier` de 64 caracteres.

| Hora | Secreto | HTTP | `error` |
|---|---|---|---|
| 18:31:51 | Anterior | **401** | `access_denied` |
| 18:31:53 | Nuevo | **403** | `invalid_grant` |

Auth0 acepta el secreto nuevo (rechaza solo el código de prueba) y rechaza el anterior. **Nota:** el laboratorio esperaba `invalid_client`
para el secreto anterior; en este tenant Auth0 responde `401 access_denied` ("Unauthorized"). El comportamiento es equivalente: credencial rechazada.

## Desviaciones y observaciones

1. **`dashboard_is_member`.** El laboratorio espera `false` tras el `revoke`. En PostgreSQL 17 de Supabase, al crear un rol el creador (`postgres`)
   recibe automáticamente una membresía con `admin option` otorgada por `supabase_admin`. `revoke una_chat_backend from current_user` no la elimina
   y `revoke ... granted by supabase_admin` da 42501 (solo ese rol puede revocarla). Resultado: `pg_has_role(..., 'member') = true`, pero
   `pg_has_role(current_user, 'una_chat_backend', 'usage') = false` y `pg_auth_members` muestra `inherit_option=false`, `set_option=false`:
   el dashboard **no hereda ni puede asumir** los privilegios del rol sin un `grant` explícito (el de la prueba de longitud sí se revoca).
2. **Cuentas.** Supabase y Auth0 se crearon con la cuenta universitaria; el login del chat se hizo con un usuario de prueba de la base de datos de Auth0
   (`Username-Password-Authentication`), no con Google.
3. **Conexión.** Sin IPv6 en el equipo de prueba se usó el session pooler `aws-1-ca-central-1.pooler.supabase.com` (el host `aws-0-…` no encuentra el tenant).
4. **Despliegue desde GitHub Actions.** El workflow `CICD pipeline` ejecuta pruebas (job `test`: success) y dispara el deploy de Render con el secreto
   `RENDER_DEPLOY_HOOK_URL`. Ese secreto está **pendiente de configurar**, por lo que el job `Deploy` falla; los despliegues de esta práctica se hicieron
   desde Render (First Deploy automático y Manual Deploy tras la rotación).
5. **Código del servidor.** El repositorio de partida no traía `server/vault.js` ni `server/auth.js`; se implementaron (Authorization Code + PKCE,
   `client_secret_post`, cookie de sesión firmada, lectura del secreto solo en memoria al arrancar).

## Capturas (`evidencias/lab-vault/`)

01 Vault · 02 script de privilegios · 03 `anon` 42501 · 04 `authenticated` 42501 · 05 `anon` vs `vault` 42501 · 06 `secret_length` ·
07 `dashboard_is_member` · 10 primer login · 11 login tras rotación · 12 tipo de app · 13 Client Secret (Post) · 14 callbacks ·
15 variables de Render enmascaradas · 16 despliegues Live con commit.
