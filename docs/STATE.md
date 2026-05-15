# Estado actual del sistema

**HEAD:** `2d38100` — 13 May 2026
**Branch:** main
**Live:** https://mdqclio.github.io/AK-Cleaning/
**Codespace:** cuddly-spork (`/workspaces/AK-Cleaning`)

---

## Módulos en código

### A — Auth + Login ✅
- `login.html` con Alpine factory `window.loginForm` registrada antes de `Alpine.start()`
- Protección de rutas en `panel/js/panel-shell.js` → `iniciarPanel({ rolesPermitidos, itemActivo, tituloHeader })`
- Migrations `001_initial_schema.sql` + `002_add_superadmin.sql` aplicados en Supabase (no están en repo como archivos)
- Gotcha documentado: `fn_handle_new_user` necesita `SET search_path = public` (ver nota SQL abajo)

### B — Panel Shell ✅
- Sidebar con secciones: Overview, Operations, Records, Finance, Setup, System
- System visible solo a `superadmin`
- Dashboard con métricas reales (count exact head:true) para clientes, propiedades, empleadas activas
- `panel/js/panel-shell.js` + `panel/js/panel-config.js`

### C — Clients ✅
- Individual / Business / Trust / LLC
- Bill To con toggle
- Contactos múltiples (`cliente_contactos`): primary, receives_invoices, receives_reports
- Búsqueda extendida: busca en nombre + contactos vía OR
- Soft delete (toggle Active/Inactive)

### D — Properties + Buildings ✅ (código listo, sin datos reales)
- Dos modos: dentro de edificio (con unidad) o standalone (dirección manual)
- Modal separado para gestionar edificios
- Sección Access Information (código, portería, llave)
- Filtros: cliente, edificio, tipo, estado
- `panel/properties/index.html` + `panel/properties/index1.html` (variante, verificar cuál es la activa)

### E — Staff ✅ (código listo, 17 empleadas cargadas sin auth)
- Flujo create: signUp Auth → insert `usuarios` (rol='empleada') → insert `empleadas`
- Contract type W2/1099; service types como chips
- **17 empleadas cargadas en DB**: Andrea Manca + 16 nuevas, emails placeholder `@pending.local`, `auth_id = NULL`
- Cuentas Supabase Auth se crean cuando hagamos Block L

### F — Providers ✅ (código listo, sin datos reales)
- Con/sin app access; Tax compliance (W9/1099); Rating estrellas; Rubros como chips

### G — Services Catalog ✅
- Cards de servicios; `servicios` + `servicio_tarifas` con vigencias
- Precargados en Supabase (cantidad y detalle exacto: verificar en Supabase Dashboard)

### H — Service Orders ✅ VALIDADO
- Tabs: Today / Upcoming / Past / All
- Filtros: estado, cliente, búsqueda, asignado (post-filtrado JS)
- Servicios múltiples + asignaciones múltiples (XOR staff/provider via `chk_asignado_xor`)
- Estados: borrador → confirmada → en_curso → completada / cancelada
- Optimistic locking via `version`; audit trail completo
- `panel/orders/index.html` + `js/orders-api.js` + `js/orders-helpers.js`

### I — Checklist Templates + Checklist en OS ✅ VALIDADO
- `panel/services/checklists.html` — ABM plantillas: nombre, idioma, servicio opcional, items ordenados, flag mandatory
- Sección Checklist en modal de OS: apply template, marcar items (timestamp + completado_por)
- Items manuales; botón eliminar item
- Validación mandatory al pasar OS a "completada"; override admin con motivo en notas_internas

### J — Invoicing (EN PROGRESO)
**Archivos existentes:**
- `panel/invoices/index.html` (994 líneas)
- `panel/invoices/js/invoices-api.js` (286 líneas)
- `panel/invoices/css/invoices.css` (220 líneas)

**Etapa 1 ✅ VALIDADA** (commit `8f0db13`)
Lista con tabs (Drafts/Generated/Sent/Paid/All), búsqueda, filtro cliente, CRUD drafts, líneas manuales, Total Due en vivo.

**Etapa 2 ✅ CODEADA — pendiente validación en Mac** (commit `02ae9c5`)
- Generate Final: llama `siguiente_numero_factura()`, snapshot bill_to, genera PDF con html2pdf.js, sube a Storage, preview modal
- Void Invoice (generada → anulada)
- Download PDF en tabla y modal
- Fix del bug `<input type="date">` (`:value` + `@change`)
- Rollback si falla: `devolver_numero_factura()` + revertir a borrador

**Etapas 3 y 4 — pendientes de diseño e implementación**
- Etapa 3: selección de OS no facturadas, auto-populate líneas desde `os_servicios`
- Etapa 4: Send to Client (SendGrid Edge Function) + registro de pagos

### K–O — Pendientes de implementación
- `panel/reports/index.html` — placeholder vacío (Bloque K: Field Reports)
- `panel/purchasing/index.html` — placeholder vacío (Bloque N)
- `panel/schedule/index.html` — placeholder vacío
- `panel/payments/index.html` — placeholder vacío (Bloque J Etapa 4)
- `panel/users/index.html` — placeholder vacío
- `panel/system/` — 3 placeholders (logs, health, config) — solo superadmin
- `app-empleada/` — vacío (Bloque L: PWA Empleada)
- `app-proveedor/` — vacío (Bloque M: PWA Proveedor)

---

## Supabase — configuración activa

- Project: `ccdpbiflbewhnidigiin`
- Key: legacy JWT anon (en `config.js`)
- MCP configurado en write-enabled (sin `--read-only`)
- **Usuarios activos:**
  - Leonardo (`606bb223`) — superadmin
  - Andy Manca (`c05c7698`) — owner, `andy.flo@hotmail.com`
  - Andrea (`15279744`) — cliente de prueba
- **Bucket Storage:** `facturas` — público, sin restricción MIME, policies RLS activas

## SQL fuera de migration (no está en repo)

- **Fix `fn_handle_new_user`**: aplicado manualmente desde Dashboard. Agrega `SET search_path = public` al trigger. Pendiente formalizar como `migrations/005_fix_handle_new_user_search_path.sql`.
- **Función `siguiente_numero_factura()`**: creada via MCP 11 May 2026.
- **Función `devolver_numero_factura(p_numero integer)`**: creada via MCP 11 May 2026.
- **17 empleadas**: insertadas via SQL en sesión 13 May 2026. Sin migration formal.

## Test data en Supabase

- 1 cliente (Andrea Manca) + 2 contactos (Kevin hijo, Leonardo amigo)
- 1 propiedad (alfonsina) bajo Andrea
- 14 servicios en catálogo (verificar detalle en Supabase)
- 1 plantilla checklist (verificar en Supabase)
- OS #1 con checklist aplicado
- 17 empleadas en `usuarios` + `empleadas`, sin auth_id, emails placeholder
- 3 facturas draft de prueba (sin número) + 4 líneas en `factura_lineas` — dejar hasta que Andy confirme el flujo
- `factura_counter.proximo_numero` = 1001 (no se consumió número)
- 0 proveedores reales; 0 edificios reales
