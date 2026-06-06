# Remediación de Auditoría — AK-Cleaning

- **Repo:** `AK-Cleaning` (`github.com/mdqclio/AK-Cleaning`, branch `main`)
- **Fecha:** 2026-06-06
- **Base:** `docs/auditoria/AK-Cleaning.md`
- **Alcance de esta pasada:** SOLO arreglos seguros, reversibles, en código. NO se rotaron keys, NO se desplegó, NO se reescribió historial, NO se hizo force-push. Lo operativo/externo se documenta para el dueño.

**Leyenda:** ✅ hecho en código · 📄 documentado (acción del dueño) · ⏳ pendiente / requiere infra externa

---

## ✅ Arreglos aplicados en código

### ✅ `.gitignore` robusto (faltaba por completo)
El repo no tenía `.gitignore`. Se agregó uno que ignora `.env`, `.env.*`, `*.env`, `*.key`, `*.pem`, `*.p12`, `*.pfx`, `*service*account*.json`, `*credentials*.json`, `secrets.json`, `.supabase/`, además de basura de OS/editor y logs.

- **Archivo:** `.gitignore` (nuevo)
- **Verificación:** `git check-ignore config.js login.html supabase/functions/admin-create-user/deno.json` → no ignora ningún archivo ya trackeado. `config.js` sigue versionado (es público por diseño: solo trae la `anon_key`).
- **Reversible:** sí (borrar el archivo).

### ✅ XSS defense-in-depth en `print.html`
El template de factura (`buildInvoiceHTML`) ya escapaba con `esc()` **todos** los campos de DB de texto libre (bill_to, descripciones, datos de contacto, etc.). La única interpolación sin escapar era `${numero}` (línea 223), el número de factura. Aunque hoy ese valor lo genera el servidor (RPC `generar_numero_factura_seguro`, no es texto libre del usuario), se envolvió en `esc()` para consistencia y defensa en profundidad: si alguna vez el campo `numero` se vuelve editable, no abre un sink.

- **Archivo:** `panel/invoices/print.html` (línea ~223: `${numero}` → `${esc(numero)}`)
- **Verificación:** el script del módulo pasa `node --check` (syntax OK). `esc()` ya estaba definido en el mismo archivo.
- **Reversible:** sí (un solo carácter de cambio).

> Resto de sinks `innerHTML` auditados: `panel/js/panel-shell.js` escapa con `escHtml()` todo dato de usuario (nombre, apellido, rol, inicial); los items de menú son config estática. Los otros `innerHTML` de `print.html` son strings literales de error. No quedan sinks con datos de usuario sin escapar.

---

## Verificación de secretos (sin cambios necesarios) — ✅ confirmado limpio

- **Árbol:** el único JWT presente es la `anon_key` de Supabase en `config.js` (rol `anon`, público por diseño). No hay `service_role`, ni `sk_live/sk_test`, ni claves AWS/GitHub, ni claves privadas PEM.
- **Edge Function:** `admin-create-user/index.ts` lee `SUPABASE_SERVICE_ROLE_KEY` de `Deno.env.get(...)` y aborta si falta. Correcto: el secreto nunca se commitea.
- **Historial:** `git log -p --all` no contiene secretos de terceros ni JWTs `service_role`.
- **Datos bancarios:** ya migrados de hardcode a tabla `config_empresa` (migration 014); el template usa fallbacks literales si la fila no existe. No es un secreto (van impresos en la factura), no requiere acción.

**Conclusión:** no hay secretos reales en el árbol → nada que mover a `process.env`. No se rotó ninguna key (correcto: la anon es pública).

---

## 📄 / ⏳ Pendientes operativos/externos (acción del dueño)

Estos NO se pueden arreglar solo en código en este repo; requieren consola de Supabase, infra de CI o servicios externos. Priorizados.

### 📄 Separar entornos dev/prod (punto 5 — 🔴)
Hoy un único proyecto Supabase (`ccdpbiflbewhnidigiin`) sirve dev y prod, y el "entorno" se infiere del `basePath`.
**Pasos:**
1. Crear un **segundo proyecto Supabase** (staging) y aplicar las mismas migraciones (`migrations/005`–`015`) + snapshot RLS.
2. Parametrizar `config.js` para elegir `supabase.url`/`anon_key` según `basePath` (localhost/staging/prod), o inyectar la config por entorno en el build/deploy.
3. Hacer todas las pruebas con datos reales contra staging, nunca contra prod.

### 📄 CI/rollback en vez de push directo a `main`→Pages (punto 5 — 🔴)
El workflow actual incluye `git reset --hard && git push --force origin main` como operación normal → cero red de contención.
**Pasos:**
1. Agregar un **GitHub Action** (`.github/workflows/deploy.yml`) que publique a Pages desde `main` tras checks (al menos lint/HTML válido), en vez de servir el repo crudo.
2. **Prohibir force-push a `main`** (branch protection rule en GitHub). Trabajar por PR.
3. Documentar un rollback = revertir el commit / re-deploy del Action anterior, no `reset --hard + force-push`.

### 📄 Rate limiting en la Edge Function `admin-create-user` (puntos 4, 7 — 🔴/🟡)
La función crea cuentas Auth (cara y sensible) sin throttling propio; un invocador `owner` autenticado podría abusarla.
**Pasos (en `supabase/functions/admin-create-user/index.ts`, código — futura pasada):**
1. Throttle por invocador (`auth.uid`): N creaciones por ventana de tiempo, usando una tabla `rate_limit` (insert + count en ventana) o Supabase KV.
2. Devolver `429` con `Retry-After` al exceder.
3. Considerar también un límite global diario como circuit-breaker.

> No se tocó la Edge Function en esta pasada porque cambiar lógica de creación de cuentas sin poder desplegar/validar no es "reversible y seguro" en el sentido pedido. Queda como tarea de código acotada, no como infra.

### 📄 Monitoreo (Sentry) + budget alerts Supabase (punto 10 — 🔴)
Sin monitoreo proactivo: un fallo de facturación, una escalada o un pico de gasto pasarían inadvertidos.
**Pasos:**
1. Integrar **Sentry** (o equivalente) en el frontend (script CDN + `Sentry.init`) y en la Edge Function (captura de errores en el `catch`).
2. Configurar **budget/spend alerts** en el proyecto Supabase (consola → billing).
3. Alertas sobre `audit_log` para eventos sensibles (creación de usuarios, cambios de rol).

### 📄 Validar ejecutivamente las RLS con sesiones reales por rol (puntos 2, 6 — 🟡)
El snapshot de ~90 policies (`010_rls_policies_snapshot.sql`) está versionado pero su corrección no fue verificada ejecutándola.
**Pasos:**
1. Crear un usuario por rol (`empleada`, `proveedor`, `compras`, `admin`, `owner`) en staging.
2. Con la sesión de cada uno, intentar leer/escribir datos ajenos (ej. una `empleada` leyendo `facturas`/`clientes`, o subiendo su propio rol) y confirmar que la RLS lo bloquea.
3. Probar el patrón IDOR de `print.html` (`?id=` de otra factura) con un rol de bajo privilegio → debe fallar por RLS de `facturas`.
4. Dejar el resultado como matriz rol×tabla×operación en `docs/`.

### ⏳ Headers de seguridad (punto 6 — 🟡)
GitHub Pages **no permite headers de respuesta personalizados** (CSP, X-Frame-Options, etc.) ni en repo público ni con `_headers`. No hay punto en código donde aplicarlos sin cambiar de hosting.
**Opciones para el dueño:** poner un CDN/proxy delante (Cloudflare → Transform Rules / `_headers`) o migrar el hosting estático a Netlify/Cloudflare Pages (que sí soportan `_headers`) para fijar CSP, HSTS, X-Content-Type-Options, etc. No se fuerza nada acá porque hoy es solo Pages.

### ⏳ Cache-busting de assets propios (punto 8 — 🔴 en auditoría, bajo-medio real)
Sin versionado de assets, un deploy puede servir JS viejo desde caché. Se resuelve naturalmente al adoptar el Action de deploy (paso CI): agregar hash/`?v=` a los assets en build. Pendiente hasta tener CI.

---

## Tabla de estado tras esta pasada

| # | Punto | Antes | Acción esta pasada |
|---|-------|-------|--------------------|
| 1 | Front / secretos cliente | 🟡 | ✅ `.gitignore` agregado; confirmado sin secretos reales |
| 2 | RLS por usuario | 🟡 | 📄 validar con sesiones reales |
| 3 | Git sin secretos en historial | 🟢 | ✅ reconfirmado limpio |
| 4 | APIs auth/permisos/validación | 🟡 | 📄 rate limiting Edge Function |
| 5 | Hosting / entornos / env | 🔴 | 📄 staging + CI/rollback |
| 6 | Login / sesiones / XSS / authz | 🟡 | ✅ XSS `print.html` endurecido; 📄 headers; 📄 validar RLS |
| 7 | Rate limiting | 🔴 | 📄 throttling Edge Function |
| 8 | Caché | 🔴 | ⏳ cache-busting vía CI |
| 9 | Escalabilidad | 🟢 | — sin acción |
| 10 | Monitoreo + alertas | 🔴 | 📄 Sentry + budget alerts |

---

## Resumen

- **Arreglado en código (✅):** `.gitignore` robusto (faltaba), XSS defense-in-depth en `print.html` (`${numero}` → `${esc(numero)}`), reconfirmación de ausencia de secretos en árbol e historial.
- **Queda al dueño (📄/⏳):** separar dev/prod, CI + branch protection (no más force-push a `main`), rate limiting de `admin-create-user`, Sentry + budget alerts, validación ejecutiva de RLS por rol, headers de seguridad (requiere CDN/otro hosting), cache-busting (vía CI).
- **No se hizo (por diseño):** rotar keys, desplegar, reescribir historial, force-push.
