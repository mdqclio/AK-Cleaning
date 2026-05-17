# Schema Supabase — AK Property Management

> **Verificado 11 May 2026** contra Supabase real. Este archivo es la fuente de verdad.
> Las secciones marcadas `[VERIFICAR]` siguen sin confirmación directa.

## ⚠️ Correcciones críticas vs. documentación anterior

| Tabla | Campo documentado (INCORRECTO) | Campo real |
|---|---|---|
| `clientes` | `bill_to_nombre` | `bill_to_name` |
| `clientes` | `bill_to_direccion_1/2` | `bill_to_address_1/2` |
| `clientes` | `bill_to_ciudad` | `bill_to_city` |
| `clientes` | `bill_to_diferente bool` | **no existe** |
| `clientes` | `metodo_contacto_preferido` | `metodo_contacto` |
| `clientes` | `idioma_preferido` | **no existe** |
| `cliente_contactos` | `es_primario` | `es_principal` |
| `empleadas` | `contract_type` | `tipo_contrato` |
| `empleadas` | `disponibilidad jsonb` | `disponibilidad text` |
| `empleadas` | `documentos jsonb` | `doc_seguro_url text`, `doc_id_url text` |
| `factura_counter` | `siguiente_numero` | `proximo_numero` |
| `facturas` | `fecha_emision` | `fecha` |
| `facturas` | `enviada_a_email` | `enviada_a` |
| `facturas` | `total` | `total_due` |

## Tablas confirmadas (en uso)

### `usuarios`
Tabla central de cuentas. Cualquier persona que se loguea al sistema tiene fila acá.
- `id uuid PK`
- `auth_id uuid FK → auth.users.id NULLABLE` (NULL para empleadas precargadas que aún no tienen cuenta — Block L crea las cuentas)
- `email text UNIQUE`
- `nombre text`, `apellido text`, `telefono text`
- `rol text` CHECK in ('superadmin','owner','admin','empleada','proveedor','compras')
- `idioma text` ('es'|'en')
- `activo bool` (estado activa/inactiva — único lugar donde se controla)
- `foto_perfil text`
- `actualizado_por uuid FK`
- Trigger `trg_handle_new_user`: crea fila auto al insertar en `auth.users`
- Trigger anti-escalation: bloquea que owner se auto-promueva o modifique superadmin

> **Nota**: el módulo Users (`panel/users/`) gestiona admin/owner/compras. Las filas con `rol='empleada'` están en el módulo Staff, las `'proveedor'` en Providers, y `'superadmin'` se crea solo por SQL.

### `clientes`
- `id uuid PK`
- `nombre text NOT NULL`, `apellido text NOT NULL`
- `email text`, `telefono text NOT NULL`
- `metodo_contacto text` (default 'whatsapp') — **NO** `metodo_contacto_preferido`
- `tipo text NOT NULL` ('individual'|'business'|'trust'|'llc'), default 'individual'
- `razon_social text`, `tax_id text` (para business/trust/llc)
- `bill_to_name text` — **NO** `bill_to_nombre`
- `bill_to_email text`
- `bill_to_address_1 text` — **NO** `bill_to_direccion_1`
- `bill_to_address_2 text`
- `bill_to_city text` — **NO** `bill_to_ciudad`
- `bill_to_state text`, `bill_to_zip text`
- `notas_vip text`
- `activo bool NOT NULL` (default true)
- `creado_por uuid`, `creado_en timestamptz`
- `actualizado_por uuid`, `actualizado_en timestamptz`
- **NO existe** `bill_to_diferente` ni `idioma_preferido`

### `cliente_contactos`
- `id uuid PK`, `cliente_id uuid NOT NULL FK`
- `nombre text NOT NULL`, `rol text`, `telefono text`, `email text`
- `es_principal bool NOT NULL` (default false) — **NO** `es_primario`
- `recibe_facturas bool NOT NULL` (default false)
- `recibe_reportes bool NOT NULL` (default false)
- `notas text`
- `creado_en timestamptz`

### `edificios`
- `id uuid PK`
- `nombre text` (ej "The Setai", "1Hotel")
- `direccion_1 text`, `direccion_2 text`, `ciudad text`, `state text`, `zip text`
- `notas text`

### `propiedades`
- `id uuid PK`, `cliente_id uuid FK`
- `nombre_referencia text` (alias interno)
- `tipo text`
- `edificio_id uuid FK NULLABLE` (XOR con dirección manual)
- `unidad text` (cuando hay edificio)
- `direccion_1 text`, `direccion_2 text`, `ciudad text`, `state text`, `zip text` (cuando no hay edificio)
- `acceso_codigo text`, `acceso_porteria text`, `acceso_llave text`
- `notas_especiales text`
- `activa bool`

### `empleadas`
Datos del **rol empleada** (perfil de trabajo). Los datos personales (nombre/apellido/email/telefono/activo) viven en `usuarios`.
- `id uuid PK`
- `usuario_id uuid NOT NULL FK → usuarios.id`
- `tipo_contrato text` (employee | contractor | part-time)
- `fecha_inicio date` (cuando arrancó a trabajar)
- `tipos_servicio text[]` (qué servicios hace)
- `notas text` (notas internas, no se ven en operaciones)
- `tarifa_hora numeric` (USD/hora — visible solo para owner/superadmin, Capa 1)
- `disponibilidad text`
- `doc_seguro_url text`, `doc_id_url text`
- `creado_en timestamptz`, `actualizado_en timestamptz`

### `proveedores`
- `id uuid PK`
- `nombre_empresa text`
- `contacto_nombre text`, `email text`, `telefono text`
- `rubros text[]`
- `rating int`
- `tarifa_referencia numeric`
- `tiene_app_access bool`
- `usuario_id uuid FK NULLABLE` (si tiene app access)
- `w9_recibido bool`, `tax_id text` (decisión D7 Opus)
- `activo bool`

### `servicios`
- `id uuid PK`
- `nombre_en text`, `nombre_es text`
- `categoria text`
- `taxable bool`
- `requiere_proveedor_externo bool`
- `activo bool`
- `plantilla_checklist_id uuid FK NULLABLE` → `plantillas_checklist.id` (default template del servicio — segunda FK con plantillas_checklist, que causa la ambigüedad)

### `servicio_tarifas`
- `id uuid PK`, `servicio_id uuid FK`
- `precio numeric`, `unidad text` ('flat'|'hour'|'unit'|...)
- `vigente_desde date`, `vigente_hasta date NULLABLE`

### `ordenes_servicio`
- `id uuid PK`, `numero int` (auto correlativo)
- `cliente_id uuid FK`, `propiedad_id uuid FK`
- `programada_en timestamptz`
- `duracion_min int`
- `descripcion text`, `notas_internas text`
- `estado text` ('borrador'|'confirmada'|'en_curso'|'completada'|'cancelada')
- `costo_estimado numeric`, `costo_final numeric`
- `version int` (optimistic locking)
- `creado_por uuid FK`, `actualizado_por uuid FK`
- `creado_en timestamptz`, `actualizado_en timestamptz`
- `os_padre_id uuid FK NULLABLE` [VERIFICAR si está implementado]

### `os_servicios` (M:M OS↔servicios)
- `id uuid PK`, `os_id uuid FK`, `servicio_id uuid FK`
- `cantidad numeric`, `precio_unitario numeric`
- `notas text`

### `os_asignados`
- `id uuid PK`, `os_id uuid FK`
- `empleada_id uuid FK NULLABLE`
- `proveedor_id uuid FK NULLABLE`
- CHECK `chk_asignado_xor`: exactamente uno de empleada_id/proveedor_id no-null
- `rol_en_os text`
- `estado text`

### `plantillas_checklist`
- `id uuid PK`
- `nombre text`
- `idioma text` ('en'|'es')
- `servicio_id uuid FK NULLABLE` (FK: `plantillas_checklist_servicio_id_fkey`)
- `activa bool`
- **Hay 2 FKs con `servicios`**: la directa `plantillas_checklist_servicio_id_fkey` (plantilla→servicio) y la inversa desde `servicios.plantilla_checklist_id` (servicio→plantilla default). Por eso al hacer embed hay que usar `servicios!plantillas_checklist_servicio_id_fkey`.

### `plantilla_items`
- `id uuid PK`, `plantilla_id uuid FK`
- `descripcion text`, `orden int`, `obligatorio bool`

### `os_checklist`
- `id uuid PK`, `os_id uuid FK`
- `descripcion text`, `orden int`, `obligatorio bool`
- `completado bool`, `completado_en timestamptz`, `completado_por uuid FK`

### `audit_log` ✅ EXISTE EN SUPABASE
- `id bigint PK` (sequence, **NO** uuid)
- `tabla text NOT NULL`
- `fila_id uuid NOT NULL`
- `operacion text NOT NULL` ('INSERT'|'UPDATE'|'DELETE')
- `cambios jsonb NOT NULL` — `to_jsonb(NEW)` en INSERT, `{old, new}` en UPDATE, `to_jsonb(OLD)` en DELETE
- `usuario_id uuid NULLABLE`
- `creado_en timestamptz NOT NULL` (default now())

### `factura_adjuntos` ✅ EXISTE EN SUPABASE (tabla nueva, no documentada antes)
- `id uuid PK`
- `factura_id uuid NOT NULL FK`
- `url text NOT NULL`
- `nombre_archivo text`, `tipo text`
- `visible_para_cliente bool NOT NULL` (default true)
- `creado_en timestamptz NOT NULL`

### `factura_counter` ✅ EXISTE EN SUPABASE
- `id integer PK` (default 1, single row)
- `proximo_numero integer NOT NULL` (default 1001) — **NO** `siguiente_numero`
- Estado actual: `id=1, proximo_numero=1001` (sin facturas emitidas todavía)

### `facturas` ✅ EXISTE EN SUPABASE
- `id uuid PK`
- `numero integer NULLABLE` (NULL en drafts, asignado en Generate Final) — UNIQUE
- `cliente_id uuid NOT NULL FK`
- `idempotency_key uuid` (auto-generado por trigger) — UNIQUE
- `fecha date NOT NULL` (default CURRENT_DATE) — **NO** `fecha_emision`
- `periodo_servicio text` *(conservado, ya no se usa — reemplazado por `for_service_period`)*
- `descripcion_general text` *(conservado, ya no se usa — reemplazado por campos FOR)*
- `subtotal numeric NOT NULL` (default 0)
- `descuento_total numeric NOT NULL` (default 0)
- `tax_total numeric NOT NULL` (default 0)
- `total_due numeric NOT NULL` (default 0) — **NO** `total`
- `estado text NOT NULL` CHECK in ('borrador','generada','enviada','pagada','anulada'), default 'borrador'
- `pdf_url text`
- `enviada_en timestamptz`, `enviada_a text` — **NO** `enviada_a_email`
- `notas text`
- `version integer NOT NULL` (default 1, manejado por trigger)
- `creado_por uuid`, `actualizado_por uuid`
- `creado_en timestamptz NOT NULL`, `actualizado_en timestamptz NOT NULL`
- Bill To persistente (editables en draft, 7 columnas — renombradas desde `_snapshot` el 15 May 2026):
  - `bill_to_name text`
  - `bill_to_email text`
  - `bill_to_address_1 text`
  - `bill_to_address_2 text`
  - `bill_to_city text`
  - `bill_to_state text`
  - `bill_to_zip text`
- `propiedad_id uuid FK NULLABLE` → `propiedades(id)` ON DELETE SET NULL *(agregado 15 May 2026)*
- FOR estructurado *(agregados 15 May 2026)*:
  - `for_property_unit text`
  - `for_service_period text`
  - `for_description text`

### `factura_lineas` ✅ EXISTE EN SUPABASE
- `id uuid PK`, `factura_id uuid NOT NULL FK`
- `os_id uuid NULLABLE FK`, `os_servicio_id uuid NULLABLE FK` (NULL en líneas manuales)
- `fecha date NULLABLE`
- `descripcion text NOT NULL`
- `qty numeric NOT NULL` (default 1) — **NO** `cantidad`
- `precio_unitario numeric NOT NULL` (default 0)
- `descuento numeric NOT NULL` (default 0)
- `taxable bool NOT NULL` (default false)
- `tax_pct numeric NOT NULL` (default 0)
- `tax_monto numeric NOT NULL` (default 0)
- `total numeric NOT NULL` (default 0)
- `orden integer NOT NULL` (default 0)

## Tablas pendientes de confirmar
- `recurrencias` (decisión A5 Opus)
- `tareas`, `reportes` (Bloque K)
- `factura_pagos`, `notas_credito` [VERIFICAR EN SUPABASE]
- `facturas_outbox` (V2)
- `notificaciones` (V2)

## Funciones SQL — verificadas en Supabase (11 May 2026)

### Helpers de RLS (llamar en policies y código server-side)

| Función | Retorna | Descripción |
|---|---|---|
| `get_user_rol()` | `text` | `SELECT rol FROM usuarios WHERE auth_id = auth.uid() AND activo = TRUE` |
| `get_usuario_id()` | `uuid` | `SELECT id FROM usuarios WHERE auth_id = auth.uid() AND activo = TRUE` |
| `tiene_acceso_admin()` | `boolean` | `get_user_rol() IN ('superadmin','owner','admin')` |
| `es_superadmin()` | `boolean` | `rol = 'superadmin' AND activo = true` |
| `es_asignado_os(p_os_id uuid)` | `boolean` | `get_usuario_id()` está en `os_asignados` vía empleadas o proveedores |

> **Nota**: `tiene_acceso_admin()` delega en `get_user_rol()` (no hace la query directo). `get_usuario_id()` es la forma correcta de obtener el UUID interno del usuario en triggers/policies — usar en vez de `auth.uid()` cuando se necesita el ID de la tabla `usuarios`.

### Funciones de negocio

| Función | Retorna | Descripción |
|---|---|---|
| `siguiente_numero_factura()` | `integer` | FOR UPDATE atómico sobre `factura_counter.proximo_numero`. Counter actual: **1001**. **SECURITY DEFINER** (fix 15 May — `factura_counter` tiene RLS sin policies, INVOKER fallaba para usuarios autenticados). |
| `devolver_numero_factura(p_numero integer)` | `boolean` | Rollback seguro: decrementa solo si `proximo_numero = p_numero + 1`. Devuelve `true` si decrementó, `false` si hubo concurrencia. **SECURITY DEFINER** (mismo fix). |
| `siguiente_numero_nota_credito()` | `integer` | Idem para notas de crédito (sobre `nota_credito_counter`). **SECURITY DEFINER** (fix proactivo 15 May — mismo patrón). |

> **Regla**: cualquier función que acceda a una tabla con RLS habilitado y sin policies para usuarios autenticados DEBE ser `SECURITY DEFINER SET search_path = public`. Los counters (`factura_counter`, `nota_credito_counter`) son el caso típico.

### Triggers confirmados

| Trigger | Tabla | Función | Cuándo |
|---|---|---|---|
| `trg_audit_facturas` | `facturas` | `fn_audit_log()` | AFTER INSERT/UPDATE/DELETE |
| (otros trg_audit_*) | varias | `fn_audit_log()` | AFTER INSERT/UPDATE/DELETE |
| `trg_proteger_factura_emitida` | `facturas` | `fn_proteger_factura_emitida()` | BEFORE UPDATE |
| `trg_incrementar_version` | `facturas` | `fn_incrementar_version()` | BEFORE UPDATE |
| `trg_actualizado_en` | `facturas` (y otras) | `fn_actualizado_en()` | BEFORE UPDATE |
| `trg_handle_new_user` | `auth.users` | `fn_handle_new_user()` | AFTER INSERT |
| `trg_proteger_superadmin` | `usuarios` | `fn_proteger_superadmin()` | BEFORE UPDATE |

### Detalle de `fn_proteger_factura_emitida()`

Bloquea si `OLD.estado IN ('enviada', 'pagada')` y se intenta cambiar alguno de:
- `numero`, `cliente_id`, `subtotal`, `total_due`, `fecha`
- `bill_to_name`, `bill_to_email`, `bill_to_address_1`, `bill_to_address_2`, `bill_to_city`, `bill_to_state`, `bill_to_zip`
- `for_property_unit`, `for_service_period`, `for_description`

Error: `'Cannot modify critical fields on a sent/paid invoice. Use a credit note instead.'`

**Campos que SÍ se pueden editar en facturas enviadas/pagadas:**
`estado`, `notas`, `enviada_en`, `enviada_a`, `pdf_url`, `tax_total`, `descuento_total`, `periodo_servicio`, `descripcion_general`, `propiedad_id`

### `fn_audit_log()`

Registra en `audit_log`:
- INSERT → `cambios = to_jsonb(NEW)`
- UPDATE → `cambios = jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))`
- DELETE → `cambios = to_jsonb(OLD)`
- `usuario_id` via `get_usuario_id()` (puede ser NULL si no hay sesión activa)

### Otros triggers

- `fn_incrementar_version()` — `NEW.version = OLD.version + 1` en cada UPDATE de `facturas`
- `fn_actualizado_en()` — `NEW.actualizado_en = now()` en cada UPDATE
- `fn_handle_new_user()` — crea fila en `usuarios` al signup en `auth.users` (**NO** `handle_new_user`)
- `fn_proteger_superadmin()` — anti-escalation en `usuarios`
- `fn_proteger_reporte_inmutable()` — bloquea edición de reportes ya creados

## RLS Policies

Todas las tablas tienen policy `_admin_all` para roles `superadmin`, `owner`, `admin` vía `tiene_acceso_admin()`.

**RLS sensible — `usuarios`**:
- Superadmin: ve y gestiona TODOS
- Owner: ve y gestiona EXCEPTO superadmins (invisibles para Andrea)
- Trigger `fn_proteger_superadmin()` bloquea auto-escalación

**RLS para empleadas/proveedores (PWAs)**: NO IMPLEMENTADO. Cuando se construyan Bloques L y M revisar policies B2+B3+B4 del review Opus.

**Policy útil para OS asignadas (futuro Bloque L)**:
```sql
-- empleada solo ve sus OS
USING (es_asignado_os(id))
```
