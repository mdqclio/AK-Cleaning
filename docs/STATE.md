# Estado actual del sistema

## Commit estable de referencia
`d4f91c6` — Bloque H validado y funcionando (Service Orders completo, sin Bloque I).

## Commit actual `main`
Bloque I aplicado en 3 etapas (templates ABM + apply to OS + manual items + mandatory validation con override admin).

Commits del Bloque I:
- `5ed858e` Bloque I etapa 3.3: validación de obligatorios al completar OS
- `b4b749b` Bloque I etapa 3.2: items manuales en checklist de OS
- `f42e5dd` Bloque I etapa 3.1: borrar items del checklist de OS
- `da20ac7` Bloque I etapa 2: Sección Checklist simple en modal de OS
- `2d8e21c` Bloque I etapa 2: API para checklist de OS
- `de6b7c1` Fix: especificar foreign key explicita para plantillas-servicios
- `1d12efb` Bloque I: Checklist templates module

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

## Bloque J — Invoicing (SIGUIENTE)
Ver `docs/ROADMAP.md → Bloque J` para el flujo manual completo y los 11 pasos del proceso de facturación.

## Antes de empezar Bloque J — requisitos
1. **Verificar 3 preguntas pendientes a Andy** (enviadas, sin respuesta):
   - ¿AK tiene Florida sales tax certificate? ¿Qué servicios cobran tax?
   - ¿Cómo cobran hoy? (wire, Zelle, ACH, check, Stripe)
   - ¿Tienen contador? ¿QuickBooks? (define si hay que prever export)
2. **Confirmar que existen las tablas** en Supabase: `facturas`, `factura_lineas`, `factura_pagos`, `notas_credito`, `factura_counter`, `facturas_outbox`. Si no, crearlas con el SQL del roadmap.
3. **Numeración**: secuencia arranca en **1001** vía tabla `factura_counter` con `FOR UPDATE`.
