# Pendientes — sesión 13 May 2026

## Esperando feedback de Andy

Andy está probando el sistema en vivo desde `https://mdqclio.github.io/AK-Cleaning/`.
Arrancar próxima sesión revisando qué encontró.

---

## Prioridad alta — antes de continuar con Block J Etapa 3

### 1. Validar Block J Etapa 2 en Mac (commit `02ae9c5`)

Checklist de validación (correr después de `git pull` en la Mac, usando Chrome):

1. Sidebar → Invoices → tab Drafts
2. New Invoice → Andrea → Alfonsina / September 2025 → línea "Check out" $150 → Save Draft
3. Click en la fila → **fecha debería mostrarse ahora** (fix del bug date input)
4. Botón **Generate Final** → confirm dialog → esperar ~3-5 seg
5. Modal preview: header AK + #1001 + fecha / BILL TO Andrea / tabla / TOTAL DUE $150.00
6. Click Download → se descarga el PDF
7. Click Close → lista muestra #1001 con badge "Generated" e ícono download
8. Refrescar → sigue en "Generated"
9. En Supabase SQL Editor verificar:
   ```sql
   SELECT numero, estado, pdf_url, bill_to_name_snapshot FROM facturas;
   SELECT proximo_numero FROM factura_counter;  -- debe ser 1002
   ```
10. En Supabase Storage → bucket `facturas` → carpeta `2026` → `1001.pdf` existe

#### Posibles problemas a detectar
- **Logo en PDF**: se precarga como base64 en `init()`. Si falla (CORS u otro), PDF se genera sin logo.
- **iframe preview**: algunos browsers bloquean blob URLs en iframes. Fallback: botón Download.
- **html2pdf en Brave**: puede bloquear CDN. Si Generate Final no hace nada, revisar consola. Usar Chrome primero.
- **Upload Storage**: si PDF se genera pero no se sube, verificar policies del bucket en Dashboard.
- **Void button**: probarlo también — cambia estado a `anulada`.

---

### 2. Limpiar 3 drafts de prueba

Ejecutar con MCP Supabase cuando Andy confirme que ya entendió el flujo:

```sql
-- Ver primero
SELECT id, estado, numero, total_due FROM facturas WHERE estado = 'borrador' AND numero IS NULL;

-- Borrar líneas y facturas
DELETE FROM factura_lineas WHERE factura_id IN (
  SELECT id FROM facturas WHERE estado = 'borrador' AND numero IS NULL
);
DELETE FROM facturas WHERE estado = 'borrador' AND numero IS NULL;

-- Verificar counter (debe seguir en 1001)
SELECT proximo_numero FROM factura_counter;
```

---

### 3. Formalizar fix de `fn_handle_new_user` como migration

El fix `SET search_path = public` en el trigger fue aplicado manualmente desde Supabase Dashboard.
No está en el repo. Crear:

```
migrations/005_fix_handle_new_user_search_path.sql
```

Con el `CREATE OR REPLACE FUNCTION fn_handle_new_user()` completo tal como quedó en producción.
Crítico para reproducibilidad si se clona el schema o se restaura en otro proyecto.

---

## Prioridad media — cuando Andy lo pida

### 4. Actualizar emails reales de empleadas

Las 16 empleadas tienen email placeholder `@pending.local`. Cuando Andy pase los emails reales:
- Editar por UI en `/panel/staff` (si la UI lo permite), o
- Por SQL directo con MCP:
  ```sql
  UPDATE usuarios SET email = 'email.real@dominio.com' WHERE nombre = '...' AND apellido = '...';
  ```
- Recordar: `usuarios.email` tiene UNIQUE constraint, no pueden repetirse.

### 5. Crear cuentas Supabase Auth para empleadas (cuando hagamos Block L)

Las 17 empleadas tienen `auth_id = NULL`. Cuando arranque Block L (PWA Empleada):
- Crear cuenta en Supabase Auth por cada una (invite por email)
- Linkear `auth_id` en `usuarios`
- Configurar RLS para que empleadas solo vean sus propias OS

---

## Deuda técnica conocida

- **Rollback incompleto en Etapa 2**: si falla la actualización de `pdf_url` después del upload, el archivo quedó en Storage pero `pdf_url` en DB es null. Usuario puede regenerar pero el número ya fue consumido. Evaluar en Etapa 3.
- **`fn_incrementar_version()`**: tras Generate Final, la `version` aumenta. Si el modal está abierto con version vieja, el optimistic locking rechaza la siguiente operación. Flujo normal no es problema (abrirEditar siempre refetch).
- **Block J Etapas 3-4**: pendientes (selección OS + Send to Client + pagos).

---

## Historial de pendientes cerrados

| Item | Cerrado | Commit/acción |
|---|---|---|
| Block J Etapa 1 drafts ABM | ✅ 11 May | `8f0db13` |
| Block J Etapa 2 codeada | ✅ 11 May | `02ae9c5` |
| GitHub Pages live | ✅ 13 May | manual + `dc98459` `6c52679` |
| Fix rutas absolutas → relativas | ✅ 13 May | `dc98459` `6c52679` |
| Bug fn_handle_new_user search_path | ✅ 13 May | SQL manual (sin migration) |
| Andy en sistema (usuario + empleada) | ✅ 13 May | SQL via MCP + `66a709b` |
| Email andyflo → andy.flo corregido | ✅ 13 May | `66a709b` |
| 17 empleadas cargadas | ✅ 13 May | SQL via MCP |
| MCP Supabase write-enabled | ✅ 13 May | config MCP |
