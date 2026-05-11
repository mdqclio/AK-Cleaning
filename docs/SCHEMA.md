# Schema Supabase — AK Property Management

> Inferido de `*-api.js` y de las migrations. Si algo no está, marcar `[VERIFICAR EN SUPABASE]`.
> Para tener la verdad absoluta: pedirle a Leonardo que exporte desde Supabase Dashboard → Database → Schema visualizer, o que corra:
> ```sql
> SELECT table_name, column_name, data_type
> FROM information_schema.columns
> WHERE table_schema = 'public'
> ORDER BY table_name, ordinal_position;
> ```

## Tablas confirmadas (en uso)

### `usuarios`
- `id uuid PK`
- `auth_id uuid` (FK a `auth.users`)
- `email text`, `nombre text`, `apellido text`, `telefono text`
- `rol text` CHECK in ('superadmin','owner','admin','empleada','proveedor','compras')
- `idioma text` ('es'|'en')
- `activo bool`
- `foto_perfil text`
- Trigger `trg_handle_new_user`: crea fila auto al insertar en `auth.users`
- Trigger anti-escalation: bloquea que owner se auto-promueva o modifique superadmin

### `clientes`
- `id uuid PK`
- `tipo text` ('individual'|'business'|'trust'|'llc')
- `nombre text`, `apellido text`
- `razon_social text`, `tax_id text` (para business/trust/llc)
- `email text`, `telefono text`
- `metodo_contacto_preferido text`
- `idioma_preferido text`
- `bill_to_diferente bool`
- `bill_to_nombre text`, `bill_to_direccion_1 text`, `bill_to_direccion_2 text`, `bill_to_ciudad text`, `bill_to_state text`, `bill_to_zip text`
- `notas_vip text`
- `activo bool`, `creado_en timestamptz`, `creado_por uuid`

### `cliente_contactos`
- `id uuid PK`, `cliente_id uuid FK`
- `nombre text`, `email text`, `telefono text`, `rol text`
- `es_primario bool`, `recibe_facturas bool`, `recibe_reportes bool`

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
- `id uuid PK`
- `usuario_id uuid FK` (rol='empleada')
- `tipos_servicio text[]`
- `contract_type text` ('w2'|'1099')
- `disponibilidad jsonb` [VERIFICAR estructura]
- `documentos jsonb` [VERIFICAR]

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

## Tablas preparadas pero NO en uso en V1
(Confirmar si están creadas en Supabase antes de empezar Bloque J)

- `recurrencias` (decisión A5 Opus, separada de OS)
- `tareas`, `reportes` (Bloque K Field Reports)
- `facturas`, `factura_lineas`, `factura_pagos` (Bloque J — verificar antes de empezar)
- `factura_counter` (numeración correlativa con FOR UPDATE, arranca en 1001)
- `notas_credito` (refunds)
- `facturas_outbox` (preparada para V2 envío automático con worker)
- `audit_log` (auditoría general)
- `notificaciones` (in-app + email)

## RLS Policies confirmadas

Todas las tablas tienen policy `_admin_all` que permite todo a roles `superadmin`, `owner`, `admin` vía función helper `tiene_acceso_admin()`.

Funciones helper:
```sql
CREATE OR REPLACE FUNCTION tiene_acceso_admin() RETURNS bool AS $$
  SELECT rol IN ('superadmin','owner','admin')
  FROM usuarios WHERE auth_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION es_superadmin() RETURNS bool AS $$
  SELECT rol = 'superadmin'
  FROM usuarios WHERE auth_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

**RLS sensible — `usuarios`**:
- Superadmin: ve y gestiona TODOS (incluso otros superadmins)
- Owner: ve y gestiona EXCEPTO superadmins (invisibles para Andrea)
- Trigger anti-escalation bloquea que owner se auto-promueva

**RLS para empleadas/proveedores en sus PWAs**: NO IMPLEMENTADO TODAVÍA. Cuando se construyan los Bloques L y M hay que revisar policies B2+B3+B4 del review Opus (críticas).

## SQL completo no disponible en el repo
- `001_initial_schema.sql` (~600 líneas) — solo aplicado en Supabase, no exportado
- `002_add_superadmin.sql` — solo aplicado
- **Acción pendiente**: pedirle a Leonardo que exporte el schema desde Supabase Dashboard, o regenerarlo con `pg_dump --schema-only` para tener historial completo en repo
