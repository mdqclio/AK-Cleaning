# Estado actual del sistema

## Commit estable de referencia
`8f0db13` — Block J Etapa 1 validado (Invoices drafts ABM completo).

## Commit actual `main`
Block J Etapa 1 completa. Etapa 2 (Generate Final + PDF) pendiente.

Commits del Bloque J:
- `8f0db13` Block J Etapa 1: Invoices drafts ABM ✅ VALIDADO en Brave

Commits del Bloque I (referencia):
- `5ed858e` Bloque I etapa 3.3: validación de obligatorios al completar OS

## Bloques completados

### A — Auth, Login, Router
- Login en `login.html` con Alpine factory `window.loginForm` registrada antes de `Alpine.start()`
- Protección de rutas en `panel/js/panel-shell.js → iniciarPanel({rolesPermitidos, itemActivo, tituloHeader})`
- Migrations `001_initial_schema.sql` + `002_add_superadmin.sql` aplicados en Supabase
- **Faltante**: el SQL completo de ambos migrations no está en el repo, solo aplicados en Supabase. Exportar desde Supabase Dashboard o con `pg_dump --schema-only`.

### B — Panel Shell
- Sidebar con secciones: Overview, Operations, Records, Finance, Setup, System (System solo visible a `superadmin`)
- Dashboard con métricas reales (count exact head:true) para clientes, propiedades, empleadas activas
- Welcome con `usuario.nombre`, rol debajo del avatar
- Archivo: `panel/js/panel-shell.js` (renderSidebar + renderHeader + logout + mobile menu)

### C — Clients
- Tipo: Individual / Business / Trust / LLC
- Bill To opcional (toggle)
- Contactos múltiples por cliente (`cliente_contactos`) con flags: primary, receives_invoices, receives_reports
- Búsqueda extendida: busca también en contactos vía OR con IDs precalculados
- Soft delete (toggle Active/Inactive en modal)
- Test data: **Andrea Manca** id `15279744-5b1c-4afd-9dcb-bf8747c21d47`, con contactos Kevin (hijo) y Leonardo (amigo)

### D — Properties + Buildings
- Modal con 2 modos: dentro de un edificio (con unidad) o standalone (dirección manual)
- Modal aparte para gestionar edificios (Manage Buildings)
- Sección "Access Information" destacada (codigo, porteria, llave)
- Filtros: cliente, edificio, tipo, estado
- **No testeado con datos reales todavía**. Andrea tiene propiedad "alfonsina"

### E — Staff (Empleadas)
- Flujo: signUp Auth → insert `usuarios` (rol='empleada') → insert `empleadas` → email password reset
- Email no editable post-creación (PK)
- Service types como chips; Contract type W2/1099
- **No testeado**: Leonardo no creó empleadas todavía

### F — Providers
- Con/sin app access (toggle); Tax compliance (W9, 1099); Rating estrellas; Rubros como chips
- **No testeado** con datos reales

### G — Services Catalog
- Vista cards; `servicios` + `servicio_tarifas` con vigencias (fechas desde/hasta)
- 14 servicios precargados [VERIFICAR EN SUPABASE qué son exactamente]
- Categorías, taxable flag, requires_external_provider

### H — Service Orders ✅ VALIDADO
- Tabs: Today / Upcoming / Past / All
- Filtros: estado, cliente, búsqueda, asignado (post-filtrado en JS)
- Servicios múltiples + asignaciones múltiples (XOR staff/provider via `chk_asignado_xor`)
- Estados: borrador → confirmada → en_curso → completada / cancelada
- Optimistic locking via `version` field
- Audit trail (creado_por, actualizado_por, creado_en, actualizado_en)
- Numero auto-correlativo; Timezone Miami para `programada_en` (TIMESTAMPTZ)
- Helpers: `datetimeLocalToISO` / `isoToDatetimeLocal` en `orders-helpers.js`
- **Test exitoso**: OS #1 para Andrea + propiedad alfonsina + servicio + asignación opcional

### I — Checklist Templates + Checklist en OS ✅ VALIDADO
- **Etapa 1**: ABM plantillas (`panel/services/checklists.html`)
  - Nombre, idioma (en/es), servicio asociado opcional, items ordenados con flag mandatory
  - Reorder con flechas, soft delete
  - **Bug resuelto**: ambigüedad FK plantillas↔servicios → especificar `servicios!plantillas_checklist_servicio_id_fkey`
- **Etapa 2**: Sección Checklist en modal de OS
  - Apply template (replace mode), marcar items completados (timestamp + completado_por)
- **Etapa 3.1**: Botón eliminar item
- **Etapa 3.2**: Agregar items manuales
- **Etapa 3.3**: Validación de mandatory pendientes al pasar OS a "completada"
  - Bloquea si hay obligatorios sin completar
  - Override admin con prompt de motivo → se registra en `notas_internas` con timestamp
- **Bug histórico**: La primera implementación causaba crash de navegador (loop Alpine). Resuelto haciendo etapas incrementales con validación entre cada una.

## Test data actual en Supabase
- 1 cliente (Andrea Manca) + 2 contactos (Kevin hijo, Leonardo amigo)
- 1 propiedad (alfonsina) bajo Andrea
- 14 servicios en catálogo [VERIFICAR EN SUPABASE]
- 1 plantilla de checklist (Standard Cleaning) [VERIFICAR]
- OS #1 con checklist aplicado
- 0 empleadas, 0 proveedores, 0 edificios reales

## Pendientes de carga real
Leonardo decidió **NO cargar datos de prueba más**. Plan: hacer entrar a Andy a cargar sus datos reales y depurar con feedback de uso real.

## Block J — Invoicing EN PROGRESO

### Etapa 1 ✅ VALIDADA (commit `8f0db13`)
- Lista con tabs, búsqueda, filtro cliente, CRUD drafts, líneas manuales, Total Due en vivo.
- **Bug conocido diferido:** `<input type="date">` no muestra valor visual inicial aunque Alpine tiene el dato. Fix en Etapa 2.

### Setup Supabase para Etapa 2 ✅ HECHO
- Función `devolver_numero_factura(p_numero integer) RETURNS boolean` creada.
- Bucket Storage `facturas` (public=true), 4 policies aplicadas.
- Path PDF: `facturas/<año>/<numero>.pdf`

### Etapa 2 — PRÓXIMA (Generate Final + PDF)
Decisiones cerradas:
- Confirm dialog antes de generar: "Once generated, the invoice number cannot be changed. Continue?"
- Vista post-generate: iframe del PDF en modal + Download + Close
- Si falla upload: rollback con `devolver_numero_factura()` + estado vuelve a 'borrador'
- PDF generado con html2pdf.js (client-side)
- Logo: `assets/ak-logo.png` (ya en repo)
- Snapshot bill_to copiado de `clientes.*` al momento de Generate Final

### Etapas 3 y 4 — pendientes
- Etapa 3: Selección de OS no facturadas (auto-populate líneas desde `os_servicios`)
- Etapa 4: Send to Client + registro de pagos
