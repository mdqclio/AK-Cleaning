# Pendientes y errores — sesión 11 May 2026

## ¿Qué pasó?

El prompt de cierre de sesión llegó fragmentado (parte a parte) en vez de todo junto.
Resultado: se ejecutó MÁS de lo planeado. Etapa 2 fue **codeada** cuando el prompt
solo pedía actualizar los `.md` de contexto.

---

## Estado real al cerrar la sesión

| Item | Estado |
|---|---|
| Block J Etapa 1 (drafts ABM) | ✅ DONE — validado en Brave (`8f0db13`) |
| Block J Etapa 2 (Generate Final + PDF) | ✅ CODEADA — **SIN VALIDAR** (`02ae9c5`) |
| Introspección schema Supabase | ✅ DONE — documentada en `SCHEMA.md` |
| Gotchas date input / git pull / SECURITY DEFINER | ✅ DONE — en `CLAUDE.md` y `WORKFLOW.md` |
| CONVENTIONS.md sección Storage | ⚠️ FALTABA — agregada en este commit |
| STATE.md sesión completa | ⚠️ PARCIAL — actualizado en este commit |
| ROADMAP.md con Etapa 2 scope | ⚠️ FALTABA — actualizado en este commit |
| CLAUDE.md estado Block J | ⚠️ DESACTUALIZADO — corregido en este commit |

---

## Etapa 2: codeada pero sin validar — checklist para cuando volvés

El commit `02ae9c5` implementó todo el scope de Etapa 2. Antes de continuar con Etapa 3,
validar en la Mac (después de `git pull`):

1. Sidebar → Invoices → tab Drafts
2. New Invoice → Andrea → Alfonsina / September 2025 → línea "Check out" $150 → Save Draft
3. Click en la fila → **fecha debería mostrarse ahora** (fix del bug date input)
4. Botón **Generate Final** → confirm dialog → esperar ~3-5 seg
5. Modal preview: header AK + #1001 + fecha / BILL TO Andrea / tabla / TOTAL DUE $150.00
6. Click Download → se descarga el PDF
7. Click Close → lista muestra #1001 con badge "Generated" e ícono download
8. Refrescar → sigue en "Generated"
9. En Supabase SQL Editor:
   ```sql
   SELECT numero, estado, pdf_url, bill_to_name_snapshot FROM facturas;
   SELECT proximo_numero FROM factura_counter;  -- debe ser 1002
   ```
10. En Supabase Storage → bucket `facturas` → carpeta `2026` → `1001.pdf` existe

### Posibles problemas a detectar en Etapa 2

- **Logo en el PDF**: el logo se precarga como base64 en `init()`. Si falla (CORS u otro),
  el PDF se genera igual sin logo. Verificar visualmente.
- **iframe del preview**: algunos browsers bloquean blob URLs en iframes. Si el preview
  no carga, el fallback es el botón Download (que sí funciona con el blob URL como href).
- **html2pdf en Brave**: Brave puede bloquear scripts de CDN externos. Si el botón
  Generate Final no hace nada, revisar consola. Usar Chrome para testear primero.
- **Upload Storage**: si el PDF se genera pero no se sube, verificar policies del bucket
  en Supabase Dashboard → Storage → facturas → Policies.
- **Void button**: probarlo también — cambia estado a 'anulada'. Verificar que el
  `fn_proteger_factura_emitida` no interfiera (solo bloquea 'enviada'/'pagada').

---

## Deuda técnica identificada en Etapa 2

- **Rollback incompleto** si falla la actualización de `pdf_url` después del upload:
  el archivo quedó en Storage pero `pdf_url` en DB es null. El usuario puede regenerar
  pero el número ya fue consumido. Para Etapa 3 evaluar si esto es aceptable o agregar
  una query de limpieza.
- **`fn_incrementar_version()`**: tras Generate Final, la `version` en DB aumentó.
  Si el usuario tiene el modal abierto con la version vieja y hace algo más, el
  optimistic locking va a rechazarlo con "modified by someone else". Es correcto
  pero puede sorprender. `abrirEditar()` siempre refetch, así que no es problema
  en el flujo normal.

---

## Próximo al arrancar: Etapa 3 o validar Etapa 2 primero

**Recomendación**: validar Etapa 2 completo antes de tocar Etapa 3.

Etapa 3 scope (para cuando esté lista):
- Selección de OS completadas no facturadas para auto-popular líneas
- Link `factura_lineas.os_id` y `os_servicio_id`
- Dashboard "X OS completadas listas para facturar"
