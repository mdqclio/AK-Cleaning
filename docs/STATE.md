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
- `panel/invoices/index.html` (~1100 líneas)
- `panel/invoices/js/invoices-api.js` (~300 líneas)
- `panel/invoices/css/invoices.css` (220 líneas)

**Schema v2 ✅ APLICADO** (15 May 2026, migración MCP)
- `bill_to_*_snapshot` renombrados → `bill_to_*` (persistentes en draft, sin sufijo)
- `propiedad_id uuid FK → propiedades` (nullable)
- `for_property_unit`, `for_service_period`, `for_description` (FOR estructurado)
- `fn_proteger_factura_emitida` actualizada: cubre todos los campos nuevos
- `descripcion_general` y `periodo_servicio`: se mantienen sin uso (retrocompatibilidad)

**Bugs encontrados y corregidos en validación (15 May 2026):**
1. `facturas_estado_check` no incluía 'generada' — fix manual vía SQL Editor (DROP + ADD CONSTRAINT).
2. `siguiente_numero_factura()` y `devolver_numero_factura()` eran SECURITY INVOKER sobre `factura_counter` (RLS habilitado, sin policies) → RPC retornaba null para usuarios autenticados → error "Could not assign invoice number". Fix: ambas funciones rehechas como SECURITY DEFINER + SET search_path = public. Fix proactivo también aplicado a `siguiente_numero_nota_credito()` (mismo patrón).

**Etapa 1 ✅ VALIDADA** (commit `8f0db13`)
Lista con tabs, búsqueda, filtro cliente, CRUD drafts, líneas manuales, Total Due en vivo.

**Etapa 2 ✅ CODEADA + actualizada a schema v2** (commit original `02ae9c5`, actualizado en `e448235`)
- Generate Final: `generarNumero()` (sin snapshot — bill_to ya en draft), PDF html2pdf.js, Storage, preview modal
- Void Invoice: solo estado='generada', confirm con número
- Delete draft: desde tabla y desde modal footer, confirm en español
- Bill To: 7 campos editables en modal, auto-fill desde cliente al seleccionar
- Propiedad: dropdown vinculado a cliente, auto-fill for_property_unit
- FOR estructurado: for_property_unit, for_service_period, for_description (→ columnas propias)
- Rollback si falla Generate: devolver_numero + revertir a borrador
- **Listo para validar en Mac** (bugs de DB corregidos)

**Fases 3 y 4 — pendientes (Fase 4 se hace con Leonardo)**
- Fase 3 (pendiente): selección de OS no facturadas, auto-populate líneas desde `os_servicios`
- Fase 4 (pendiente): Send to Client (SendGrid Edge Function) + registro de pagos (`factura_pagos`)

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
- 0 facturas draft (4 drafts de prueba borrados el 15 May 2026)
- `factura_counter.proximo_numero` = 1001 (no se consumió número)
- 0 proveedores reales; 0 edificios reales
