# AK Property Management — Internal System

## ¿Qué es?
Panel interno para AK Property Management Concierge Services (Miami Beach, FL). Andrea Manca administra ~100 propiedades de clientes high-end. Sistema multi-rol: owner/admin/empleada/proveedor/compras + superadmin oculto (Leonardo, vendor).

## Stack
- **Frontend**: HTML vanilla + Alpine.js (CDN ESM, sin build step) + Lucide icons (CDN)
- **Backend**: Supabase (Postgres + Auth + RLS + Storage)
- **Hosting local**: `python3 -m http.server 8000` desde raíz del proyecto
- **Hosting prod**: GitHub Pages (LIVE: `https://mdqclio.github.io/AK-Cleaning/`)
- **Idioma**: UI en inglés, código y comentarios en español rioplatense

## Paths
- Codespace (acá): `/workspaces/AK-Cleaning`
- Mac de Leonardo: `/Users/leonardofernandez/Desktop/Ak Cleaning/ak-system`
- Repo: `github.com/mdqclio/AK-Cleaning` (branch `main`)

## Supabase
- Project URL: `https://ccdpbiflbewhnidigiin.supabase.co`
- **IMPORTANTE**: usar la *legacy JWT anon key* (Settings → API → tab "Legacy anon, service_role API keys"). La nueva `sb_publishable_*` NO funciona con REST.
- anon_key está en `config.js` — no repetir acá.
- Leonardo auth_id: `606bb223-93f8-438a-9e10-95aafab27fbf` (rol superadmin)
- Andy auth_id: `c05c7698-a9da-4070-bf6a-79addf863bcc` (rol owner, email `andy.flo@hotmail.com`)
- Andrea cliente_id: `15279744-5b1c-4afd-9dcb-bf8747c21d47` (cliente de prueba con propiedad "alfonsina")
- Timezone: `America/New_York` (Miami DST) en TIMESTAMPTZ

## Workflow Codespaces ↔ Mac
1. Leonardo edita en Codespaces (vos)
2. `git add` + `git commit` + `git push` desde acá
3. Leonardo hace `git pull` en la Mac
4. Testea en `http://localhost:8000` (Chrome, no Brave — Brave crashea con loops Alpine)

**Regla**: NO editar en la Mac. Solo `git pull` y testear. La Mac no tiene credenciales push.

## Decisiones cerradas (NO cuestionar)
- `/app` único, sin separación core/app (G1 review Opus)
- Alpine.js, no React/Vue (H2)
- ABMs específicos por módulo, no engine genérico (G2)
- Supabase Pro + backup diario a Backblaze B2 (~$27/mes)
- Facturación V1 = **MANUAL** (Andy decide cuándo facturar, no trigger automático)
- Pricing nivel medio: tarifa por servicio (`servicio_tarifas` con vigencias), modificable por OS; tarifas por cliente diferidas
- Líneas de factura Opción B: una OS puede generar múltiples líneas
- Nombres SQL en español (`clientes`, `propiedades`, `ordenes_servicio`), UI en inglés vía i18n

## Patrones técnicos críticos (gotchas)
1. **NUNCA** `x-show` con objeto `null` + `x-model` en sus propiedades → Alpine crashea con `Cannot read property X of null`. Usar `<template x-if="obj">` en su lugar.
2. **NUNCA** `return` top-level en `<script type="module">`. Envolver en IIFE async.
3. **Foreign keys ambiguas en Supabase**: cuando hay dos FKs entre dos tablas (caso `plantillas_checklist` ↔ `servicios`), especificar explícito: `servicios!plantillas_checklist_servicio_id_fkey(...)`.
4. **Alpine + módulos**: Alpine debe importarse DESPUÉS de registrar `window.factories`. Patrón:
   ```js
   <script type="module">
   (async () => {
     window.miPagina = function() { return {...} };
     const Alpine = (await import('https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js')).default;
     window.Alpine = Alpine;
     Alpine.start();
   })();
   </script>
   ```
5. **Status 300 + disk cache en Network tab** → tickear "Disable cache" en DevTools.
6. **Chrome consola bloquea paste** → tipear `allow pasting` + Enter primero.
7. **`cat > heredoc` por copy-paste** corrompe archivos JS/CSS con wrapper HTML. Usar siempre la herramienta `Write` directamente o GitHub web → `git pull`.
8. **`<input type="date">` no muestra valor inicial en Alpine** → el browser no refleja el value aunque Alpine lo tenga correcto en `formData`. Fix: usar `:value` con binding explícito y `@change` en vez de `x-model`, o bien usar `x-effect` para forzar el valor. Workaround manual: el usuario puede tipear la fecha. Fix aplicado en Etapa 2 de Invoices.
9. **GitHub Pages no soporta rutas absolutas** cuando el repo vive en subcarpeta (`/user/repo/`). Siempre usar rutas relativas (`../css/`, `./js/`). `APP_CONFIG.basePath` en `config.js` detecta el entorno dinámicamente.
10. **Module imports JS requieren prefijo `./` o `../`** — el browser no acepta `js/auth.js` sin punto. Browsers son estrictos con esto; Node.js es más permisivo. Siempre usar `./js/auth.js`.
11. **`SECURITY DEFINER` functions necesitan `SET search_path = public`** si referencian funciones del mismo schema. Sin esto, el search_path al evaluar RLS no incluye `public` y las funciones helper no se encuentran → "Database error" al intentar hacer signup. Aplica a `fn_handle_new_user` y cualquier trigger SECURITY DEFINER similar.
12. **MCP Supabase con `--read-only`** bloquea UPDATE/INSERT/DELETE y también `apply_migration`. Para poder escribir desde Claude, sacar el flag `--read-only` de la configuración MCP.

## Estado actual
- ✅ Bloque A: Auth + Login + Migration 002 (superadmin)
- ✅ Bloque B: Panel shell, sidebar con secciones, dashboard con métricas
- ✅ Bloque C: Clients (búsqueda incluye contactos)
- ✅ Bloque D: Properties + Buildings (sin datos reales)
- ✅ Bloque E: Staff (17 empleadas cargadas vía SQL, sin auth_id aún — cuentas se crean en Block L)
- ✅ Bloque F: Providers (sin datos reales)
- ✅ Bloque G: Services Catalog (14 servicios precargados [VERIFICAR EN SUPABASE])
- ✅ Bloque H: Service Orders (validado con OS #1) — commit estable: `d4f91c6`
- ✅ Bloque I: Checklist Templates + Checklist en OS (3 etapas incrementales)
- 🔄 Bloque J: Invoicing — Etapa 1 ✅ VALIDADA (`8f0db13`) · Etapa 2 ✅ CODEADA sin validar (`02ae9c5`) · Etapas 3-4 pendientes
- ⏸ Bloques K-O: Field Reports, PWA Empleada, PWA Proveedor, Compras, Settings

## Sidebar real del panel
Overview (Dashboard) / Operations (Service Orders, Schedule, Field Reports, Purchasing) / Records (Clients, Properties, Staff, Providers) / Finance (Invoicing, Payments) / Setup (Services Catalog, Users) / System (solo superadmin: Audit Log, System Health, Configuration)

## Reglas de trabajo conmigo
- **Modo incremental obligatorio**: 1 cambio → commit → testeo Leonardo → siguiente. NO batch.
- Si vas a tocar varios archivos, usá `str_replace` (Edit) no `Write` completo, salvo archivo nuevo.
- Antes de modificar un HTML grande, leé el contexto exacto que vas a reemplazar — no asumas.
- Si un cambio requiere SQL nuevo, primero verificá schema en Supabase (ver `docs/SCHEMA.md`).
- Si encontrás algo raro, **pará y preguntá**. No improvises sobre el código que ya funciona.
- Cuando termines un cambio, hacé `git add` + `git commit` + `git push` automáticamente.

## Comandos útiles
```bash
# Estado
git status && git log --oneline -10

# Push standard
git add . && git commit -m "..." && git push

# Revert al último estable (Bloque H)
git fetch origin && git reset --hard d4f91c6 && git push --force origin main
```
