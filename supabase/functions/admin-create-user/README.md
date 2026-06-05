# Edge Function: `admin-create-user`

Creación de cuentas **server-side** con `service_role`, verificando que el invocador
es `owner`/`superadmin`. Reemplaza el flujo viejo de `signUp()` desde el browser
(que hijackeaba la sesión del admin y obligaba a RPCs inseguros).

Ver `docs/auditoria.md` → Bloque 2.

## Qué hace

1. Lee el JWT del header `Authorization` y resuelve quién llama.
2. Verifica server-side que ese usuario sea `owner`/`superadmin` y esté `activo`.
3. Valida email + rol (whitelist, nunca `superadmin`).
4. `auth.admin.createUser()` (service_role) → dispara `fn_handle_new_user`.
5. Fija `nombre/apellido/telefono/rol/activo` en `usuarios` (rol decidido en server).
6. Si es `empleada`, inserta en `empleadas` (rollback de la cuenta auth si falla).
7. Devuelve `action_link` (recovery) para que el admin se lo pase al nuevo usuario.

## Deploy

Requiere [Supabase CLI](https://supabase.com/docs/guides/cli) logueado y linkeado al
proyecto `ccdpbiflbewhnidigiin`.

```bash
# desde la raíz del repo
supabase functions deploy admin-create-user --project-ref ccdpbiflbewhnidigiin

# Secrets (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase
# automáticamente en runtime; NO hace falta setearlos a mano salvo override).
```

> ⚠️ La `service_role key` NUNCA va al frontend ni a `config.js`. Solo vive en el
> runtime de la Edge Function (la inyecta Supabase). Si alguna vez la pegás en el
> cliente, rotala de inmediato en Settings → API.

## Probar

```bash
curl -i -X POST \
  "https://ccdpbiflbewhnidigiin.supabase.co/functions/v1/admin-create-user" \
  -H "Authorization: Bearer <JWT_DE_UN_OWNER_LOGUEADO>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","rol":"compras","nombre":"Test","apellido":"User"}'
```

Esperado: `403` si el JWT no es owner/superadmin; `200 {ok:true, action_link:...}` si lo es.

## Cutover en el cliente (paso supervisado, con testeo de Leonardo)

1. Deploy de esta función.
2. En `config.js`, poner `APP_CONFIG.features.serverSideAccounts = true`.
3. `js/admin-api.js` ya enruta la creación a esta función cuando el flag está `true`.
4. Cablear `crearUsuario` / `crearEmpleada` / `crearProveedor` para delegar en
   `crearCuentaAdmin()` (ver TODO en cada `*-api.js`). Probar alta de cada rol.
5. Cuando funcione: **deshabilitar Sign Ups públicos** en Supabase
   (Auth → Providers → Email → Sign Ups OFF). A partir de ahí, ninguna cuenta puede
   crearse desde el cliente y el residual empleada→owner queda cerrado.
6. Opcional: revocar `EXECUTE` de los RPCs `*_post_signup` a `authenticated`
   (quedan obsoletos una vez que todo pasa por la Edge Function).
