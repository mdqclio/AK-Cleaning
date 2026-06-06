# Auditoría de Producción — AK-Cleaning

- **Repo:** `AK-Cleaning` (`github.com/mdqclio/AK-Cleaning`, branch `main`)
- **App:** Panel interno multi-rol para AK Property Management (Miami Beach) — administra ~100 propiedades de clientes high-end: clientes, propiedades, staff, proveedores, órdenes de servicio, facturación y pagos.
- **Fecha:** 2026-06-06
- **Stack:** HTML vanilla + Alpine.js (CDN, sin build step) + Lucide · Supabase (Postgres + Auth + RLS + Storage) + 1 Edge Function (Deno) · Hosting GitHub Pages
- **Método:** lectura estática del núcleo (config, auth, router, supabase-client, admin-api, panel-shell, print.html), migraciones SQL (005–015 incluyendo snapshot RLS), Edge Function, y scan de árbol + historial git por secretos. No se ejecutó la app ni se probaron exploits.
- **Estado declarado:** nada en producción aún, sin uso real (CLAUDE.md). Existe una auditoría previa propia (`docs/auditoria.md`) con remediación en curso.

**Leyenda:** 🟢 ok · 🟡 mejorable · 🔴 bloqueante

---

## 1. Front comprimido, sin source maps, sin secretos en el cliente — 🟡

**Hallazgo:** No hay secretos de terceros en el cliente; la `anon_key` de Supabase en `config.js` es pública por diseño (correcto), y los datos bancarios que antes estaban hardcodeados se movieron a la tabla `config_empresa` (migration 014). No hay source maps. Pero el front se sirve **sin minificar/comprimir** (HTML/JS vanilla tal cual, sin build step) y depende de CDNs externos.

**Riesgo:** Bajo en seguridad (no hay leak), medio en rendimiento/peso. Aceptable para una app interna de bajo volumen.

## 2. Base de datos con RLS: cada usuario solo accede a sus datos — 🟡

**Hallazgo:** RLS está habilitada y **ahora versionada** (`010_rls_policies_snapshot.sql`, ~90 policies sobre todas las tablas de negocio: clientes, propiedades, facturas, empleadas, etc.), con triggers anti-escalación (`fn_proteger_superadmin`) y helpers `get_user_rol()`/`tiene_acceso_admin()`. El modelo es por **rol** (admin/owner ven todo), no por "dueño de fila" — apropiado para un panel interno, pero el snapshot fue exportado de la DB y **no se verificó ejecutándolo** que cada policy restrinja como se espera.

**Riesgo:** Medio. La base parece defendible, pero la corrección de cada policy es un acto de fe hasta validarla contra casos reales (ej. una empleada intentando leer facturas).

## 3. Git sin secretos en el historial — 🟢

**Hallazgo:** Scan del historial completo (`git log -p --all`) no encontró API keys de terceros, service_role keys, tokens ni claves privadas. El único JWT en historia es la `anon` key (pública). La `service_role` vive solo como env var inyectada por Supabase en la Edge Function, nunca commiteada.

**Riesgo:** Ninguno.

## 4. APIs con autenticación, permisos y validación de entradas — 🟡

**Hallazgo:** La única API server-side propia (Edge Function `admin-create-user`) está **bien hecha**: autentica al invocador por JWT, verifica server-side que sea owner/superadmin, fija el rol del lado servidor (no confía en el cliente), valida email/rol contra whitelist y prohíbe crear `superadmin`. El resto de "APIs" son llamadas directas del browser a PostgREST/Supabase, cuya autorización **depende enteramente de la RLS** (punto 2). La inyección de filtro PostgREST en búsquedas fue mitigada (`safe-filter.js`). Los RPCs `*_post_signup` vulnerables a escalada (hallazgos C1/C2 de la auditoría previa) fueron revocados (migration 015).

**Riesgo:** Medio. La superficie server-side propia es sólida; la validación de las escrituras directas recae 100% en RLS sin verificar.

## 5. Hosting/despliegue estable, entornos separados, variables de entorno — 🔴

**Hallazgo:** Despliegue por **push directo a `main` → GitHub Pages**, sin CI, sin pipeline, sin tests automáticos, sin staging. **Un solo proyecto Supabase** sirve de dev y prod (mismo `config.js`). No hay separación de entornos ni variables de entorno (config hardcodeada; el "entorno" se infiere del `basePath`). El workflow documentado incluye `git reset --hard ... && git push --force origin main` como operación normal.

**Riesgo:** Alto. Sin entorno de staging ni separación dev/prod, cualquier prueba contamina datos reales y cualquier push roto va directo a producción sin red de contención. Bloqueante para uso con datos reales de clientes.

## 6. Seguridad: login, sesiones, vulns comunes (XSS, authz real) — 🟡

**Hallazgo:** Login con Supabase Auth (email+password, reset por email); sesiones persistidas con auto-refresh; `obtenerDatosUsuario` filtra `activo=true` (un usuario desactivado pierde acceso al re-chequear). XSS mitigado donde importa: `panel-shell.js` escapa con `escHtml()`, y Alpine `x-text` escapa por defecto. **Pero** la autorización de UI (router, menú por rol) sigue siendo client-side y solo vale si la RLS la respalda (punto 2); `print.html` tiene un patrón IDOR (`id` de la URL → `obtenerFactura`) cuya defensa real es la RLS de `facturas`. `print.html` usa `innerHTML` con datos de DB pero el builder no fue auditado aquí en detalle. Protección de contraseñas filtradas (HaveIBeenPwned) OFF — riesgo aceptado por limitación de plan FREE.

**Riesgo:** Medio. El authz real existe (RLS + Edge Function + trigger anti-escalación), pero su efectividad depende de validar el punto 2.

## 7. Rate limiting en endpoints caros — 🔴

**Hallazgo:** No hay rate limiting propio en ningún lado. La Edge Function `admin-create-user` (crea cuentas Auth, operación cara y sensible) no tiene throttling. Se depende exclusivamente de los límites por defecto de Supabase Auth/PostgREST.

**Riesgo:** Medio-alto. Un invocador autenticado con rol owner podría abusar de la creación de cuentas; endpoints de lectura quedan expuestos a los límites genéricos de Supabase, no a una política propia.

## 8. Caché donde haga falta — 🔴

**Hallazgo:** No hay estrategia de caché. Los assets (CSS/JS) se sirven por GitHub Pages con sus headers por defecto; los CDNs (Alpine, Lucide, Supabase vía skypack) cachean del lado del proveedor pero no hay versionado de assets propios (cache-busting). CLAUDE.md documenta problemas de caché de DevTools como gotcha recurrente, señal de que el tema no está controlado. No hay caché de queries.

**Riesgo:** Bajo-medio. Sin cache-busting, un deploy puede servir JS viejo a clientes con caché; para una app interna pequeña el impacto es limitado.

## 9. Escalabilidad para muchos usuarios — 🟢

**Hallazgo:** El frontend es estático (GitHub Pages escala trivialmente) y el backend es Supabase gestionado (Postgres + PostgREST), con plan Pro y backup diario. La carga esperada es baja (1 empresa, ~100 propiedades, decenas de usuarios). La arquitectura soporta holgadamente el caso de uso. Hay locks optimistas por `version` en facturas/órdenes para concurrencia.

**Riesgo:** Bajo. Dimensionamiento adecuado para el caso de uso real.

## 10. Monitoreo de errores/rendimiento/gasto con alertas — 🔴

**Hallazgo:** **Sin monitoreo.** No hay Sentry ni equivalente, ni tracking de errores de frontend, ni alertas de rendimiento, ni alertas de gasto sobre Supabase. Existe una página interna `system/health.html` y un `audit_log`, pero son consulta manual, no monitoreo proactivo con alertas. Los errores de la Edge Function solo quedan en los logs de Supabase si alguien los mira.

**Riesgo:** Alto. En producción, un fallo (ej. facturación corrupta, escalada, pico de gasto) pasaría inadvertido hasta que un humano lo note.

---

## Tabla resumen

| # | Punto | Estado |
|---|-------|--------|
| 1 | Front comprimido, sin source maps, sin secretos | 🟡 |
| 2 | RLS por usuario | 🟡 |
| 3 | Git sin secretos en historial | 🟢 |
| 4 | APIs con auth, permisos y validación | 🟡 |
| 5 | Hosting/despliegue, entornos, env vars | 🔴 |
| 6 | Seguridad: login, sesiones, XSS, authz | 🟡 |
| 7 | Rate limiting | 🔴 |
| 8 | Caché | 🔴 |
| 9 | Escalabilidad | 🟢 |
| 10 | Monitoreo + alertas | 🔴 |

---

## Los 3 arreglos más urgentes

1. **Separar entornos dev/prod y montar un despliegue con red de contención (punto 5).** Crear un proyecto Supabase de staging distinto del de producción y un GitHub Action que despliegue desde `main` (en vez de push/force-push directo). Hoy se prueba y se publica sobre la misma base de datos real, sin staging ni rollback seguro: bloquea cualquier uso con datos de clientes.

2. **Instrumentar monitoreo de errores y alertas de gasto (punto 10).** Sumar captura de errores de frontend y Edge Function (Sentry o similar) + una alerta de presupuesto en Supabase. Sin esto, una factura corrupta, una escalada de privilegios o un pico de costo pasarían desapercibidos en producción.

3. **Validar ejecutivamente la RLS y agregar rate limiting a la creación de cuentas (puntos 2, 4 y 7).** Probar las ~90 policies del snapshot con sesiones reales de cada rol (confirmar que una empleada no lee facturas/clientes ajenos ni escala su rol) y poner throttling sobre la Edge Function `admin-create-user`. La autorización completa del sistema descansa en que la RLS sea correcta, y eso aún es un acto de fe.
