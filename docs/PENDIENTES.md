# Pendientes — 15 May 2026

## Prioridad alta

### 1. Validar Block J Etapa 2 en Mac

Después de `git pull` en Mac, usando Chrome:

1. Login como Andy → Invoices → tab Drafts
2. New Invoice → Andrea → Alfonsina / September 2025 → línea "Check out" $150 → Save Draft
3. Click en la fila → **la fecha debe mostrarse** (fix del bug date input)
4. Botón **Generate Final** → confirm dialog → esperar ~3-5 seg
5. Modal preview: header AK + #1001 + fecha / BILL TO Andrea / tabla / TOTAL DUE $150.00
6. Click Download → se descarga PDF
7. Click Close → lista muestra #1001 con badge "Generated" e ícono download
8. Refrescar → sigue en "Generated"
9. En Supabase Dashboard verificar:
   ```sql
   SELECT numero, estado, pdf_url, bill_to_name_snapshot FROM facturas;
   SELECT proximo_numero FROM factura_counter;  -- debe ser 1002
   ```
10. Storage → bucket `facturas` → carpeta `2026` → `1001.pdf` existe
11. Probar Void Invoice también

**Posibles problemas:**
- Logo en PDF: se precarga como base64 en `init()`. Si falla, PDF sale sin logo.
- iframe preview: algunos browsers bloquean blob URLs. Fallback: botón Download.
- html2pdf en Brave: puede bloquear CDN. Usar Chrome.
- Upload Storage: si PDF se genera pero no sube, verificar policies del bucket.

---

### 2. Formalizar fix de `fn_handle_new_user` como migration

El fix `SET search_path = public` fue aplicado manualmente desde Supabase Dashboard. No está en repo. Crear:

```
migrations/005_fix_handle_new_user_search_path.sql
```

Con el `CREATE OR REPLACE FUNCTION fn_handle_new_user()` completo tal como quedó. Crítico para reproducibilidad.

---

## Prioridad media

### 3. Limpiar 3 drafts de prueba

Cuando Andy confirme que entendió el flujo:

```sql
DELETE FROM factura_lineas WHERE factura_id IN (
  SELECT id FROM facturas WHERE estado = 'borrador' AND numero IS NULL
);
DELETE FROM facturas WHERE estado = 'borrador' AND numero IS NULL;
-- Verificar: SELECT proximo_numero FROM factura_counter;  -- debe seguir en 1001
```

### 4. Actualizar emails reales de empleadas

16 empleadas tienen email placeholder `@pending.local`. Cuando Andy pase los emails:
- Editar por UI en `/panel/staff` o por SQL via MCP
- `usuarios.email` tiene UNIQUE constraint

### 5. Verificar properties/index1.html

Existe `panel/properties/index1.html` junto al `index.html` normal. Confirmar cuál es la versión activa y si el otro puede borrarse.

---

## Próximos bloques (pendientes de diseño + implementación)

- **Block J Etapa 3**: selección de OS no facturadas, auto-populate líneas desde `os_servicios`
- **Block J Etapa 4**: Send to Client (SendGrid Edge Function) + registro de pagos (`factura_pagos`)
- **Block K**: Field Reports (empleadas/proveedores reportan a admin, con fotos)
- **Block L**: PWA Empleada (mobile-first, login, agenda del día, checklist, field reports)
- **Block M**: PWA Proveedor (similar a L, más OS hijas sugeridas)
- **Block N**: Purchasing (lista de compras, inputs desde Field Reports)
- **Block O**: Settings + System Admin (empresa, logs, audit, config)

---

## Deuda técnica

- **Rollback parcial Etapa 2**: si falla actualizar `pdf_url` tras upload exitoso, el archivo quedó en Storage pero `pdf_url` en DB es null. Usuario puede regenerar pero el número ya fue consumido. Evaluar en Etapa 3.
- **Optimistic locking post-Generate**: `version` aumenta al generar. Si el modal tenía una version vieja, la siguiente operación falla. Flujo normal no es problema (abrirEditar siempre refetch). Documentado por si aparece en pruebas.
- **Migrations faltantes en repo**: el schema completo se aplicó en Supabase pero no hay archivos SQL en el repo. Si se clona el schema o se restaura, habría que exportar desde Supabase Dashboard.

---

## Historial de pendientes cerrados

| Item | Cerrado | Referencia |
|---|---|---|
| Block J Etapa 1 drafts ABM | ✅ 11 May | commit `8f0db13` |
| Block J Etapa 2 codeada | ✅ 11 May | commit `02ae9c5` |
| GitHub Pages live | ✅ 13 May | commit `dc98459` `6c52679` |
| Fix rutas absolutas → relativas (34 archivos) | ✅ 13 May | commit `dc98459` `6c52679` |
| Bug fn_handle_new_user search_path | ✅ 13 May | SQL manual (sin migration) |
| Andy en sistema (usuario owner + empleada) | ✅ 13 May | SQL via MCP + commit `66a709b` |
| Email andy.flo corregido (era andyflo) | ✅ 13 May | commit `66a709b` |
| 17 empleadas cargadas | ✅ 13 May | SQL via MCP |
| MCP Supabase write-enabled | ✅ 13 May | config MCP |
