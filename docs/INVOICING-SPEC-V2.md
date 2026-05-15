# Invoicing V2 — Spec de rediseño simplificado

> Status: **DRAFT — pendiente de aprobación de Andy/Leonardo**
> Objetivo: Reemplazar el flujo actual de facturación por un modelo "página única" donde Andy carga una factura en menos de 1 minuto, con número editable, pre-fill desde OS y un único click para PDF final.
> Esta spec NO modifica código todavía. Es el plano del rediseño.

---

## Estado actual

### Archivos del módulo (a fecha 2026-05-15)

| Archivo | Líneas | Qué hace |
|---|---:|---|
| `panel/invoices/index.html` | 994 | Página única con: tabla listado + modal grande de creación/edición + modal preview PDF. Contiene el componente Alpine `invoicesPage()` y el template HTML del PDF (`renderizarHTMLPDF`). |
| `panel/invoices/js/invoices-api.js` | 286 | Capa de acceso a Supabase. Todas las funciones devuelven `{ data/factura, error }`. |
| `panel/invoices/css/invoices.css` | ~150 | Estilos del modal de factura, líneas, preview iframe, badges de estado. |

### Funciones exportadas por `invoices-api.js`

| Función | Para qué se usa |
|---|---|
| `listarFacturas({ busqueda, estado, cliente_id, pagina, porPagina })` | Listado paginado con filtros por tab (drafts/generated/sent/paid/all) y por cliente. |
| `obtenerFactura(id)` | Detalle completo (factura + cliente + líneas ordenadas). |
| `crearFactura(datosFactura, lineas)` | INSERT en `facturas` (estado=borrador, `creado_por` desde sesión) + bulk INSERT de líneas. |
| `actualizarFactura(id, datosFactura, lineas, version)` | UPDATE con optimistic locking; borra todas las líneas y reinserta (estrategia replace). |
| `eliminarFactura(id)` | Solo permite borrar borradores. |
| `obtenerClienteParaFactura(cliente_id)` | Trae los campos `bill_to_*` del cliente para construir el snapshot. |
| `generarNumeroYSnapshot(id, version, snapshotData)` | Llama `siguiente_numero_factura()` RPC, UPDATE con `numero`, `estado='generada'` y los `bill_to_*_snapshot`. Rollback con `devolver_numero_factura()` si el UPDATE falla. |
| `subirPDF(numero, año, blob)` | Upload a Storage `facturas/<año>/<numero>.pdf` con upsert. |
| `actualizarPdfUrl(id, pdf_url)` | UPDATE de `pdf_url` post-upload. |
| `devolverNumero(numero)` | Rollback del counter. |
| `revertirABorrador(id)` | UPDATE `estado='borrador', numero=NULL`. |
| `anularFactura(id, version)` | UPDATE `estado='anulada'` con version-check. |
| `listarClientesActivos()` | Dropdown. |
| `traducirError(error)` | Mapea errores Postgres → mensajes UI. |

### Flujo actual en una bullet

`Modal "New Invoice"` → completar cliente + fecha + FOR (3 campos) + líneas a mano → **Save Draft** (estado=borrador, sin número). Después abrir el draft → **Generate Final** → confirm modal → asigna número (RPC) + snapshot bill_to + render HTML → html2pdf → upload Storage → guarda `pdf_url` → muestra preview. Si algo falla post-numeración → `devolver_numero_factura()` + `revertir a borrador`.

### Fricciones detectadas (justifican V2)

1. **Modal con 4 form-sections + scroll**: el ojo se pierde, demasiado scroll para una factura simple.
2. **Sin pre-fill de OS**: las líneas se tipean siempre a mano aunque la OS ya tenga `costo_final` y servicios cargados.
3. **Número de factura no es editable**: hoy se asigna por RPC y el usuario no lo ve hasta después de "Generate Final". Andy a veces necesita backdating o saltear números (por error de papel previo).
4. **"FOR" se guarda como string multilínea concatenado** (`descripcion_general` con `\n`), no como propiedad relacional. Hace el split frágil.
5. **No hay link OS ↔ línea de factura en la UI**: aunque la tabla `factura_lineas` tiene `os_id` y `os_servicio_id`, las líneas creadas en la UI siempre los dejan NULL.

---

## Spec del módulo V2

### Layout: una sola pantalla

Se elimina el modal grande. La pantalla `/panel/invoices/` muestra el listado a la izquierda y un **panel de edición persistente** a la derecha (en mobile: full screen al elegir "New Invoice" o tocar una factura). El listado y las tabs (Drafts/Generated/Sent/Paid/All) se mantienen como están.

El panel de edición tiene **5 zonas verticales**, en este orden:

```
┌──────────────────────────────────────────────────────┐
│ 1. HEADER (fijo, no editable)                        │
│    [Logo AK]   AK PROPERTY MANAGEMENT                │
│                CONCIERGE SERVICES                    │
│                Miami Beach, FL 33140                 │
│                786-253-7983                          │
│                akconciergeservices@gmail.com         │
├──────────────────────────────────────────────────────┤
│ 2. NUMERO + FECHA                                    │
│    Invoice #: [_____1042_____]   Date: [2026-05-15]  │
│                ^ pre-fill RPC, editable              │
├──────────────────────────────────────────────────────┤
│ 3. BILL TO              │ FOR                        │
│    Client ▼  [Doe Inc]  │ Property ▼  [Alfonsina 4B] │
│    Name    [...]        │ Service period [May 2026]  │
│    Email   [...]        │ Description    [...]       │
│    Addr 1  [...]        │                            │
│    Addr 2  [...]        │                            │
│    City/St/Zip [...]    │                            │
├──────────────────────────────────────────────────────┤
│ 4. ITEMS (tabla de líneas)                           │
│    [✓] Date  Description           Qty  Unit  Total  │
│    [✓] May 5 Cleaning · Alfonsina  1    280   280.00 │
│    [✓] May12 Cleaning · Alfonsina  1    280   280.00 │
│    [+ Agregar ítem manual]                           │
├──────────────────────────────────────────────────────┤
│ 5. TOTAL                          Total Due: $560.00 │
├──────────────────────────────────────────────────────┤
│   [Save Draft]              [Generate Final PDF]     │
└──────────────────────────────────────────────────────┘
```

### Comportamiento por zona

#### 1. Header (fijo)

Auto-generado por el sistema. Logo AK desde `/assets/ak-logo.png` (ya precargado como base64 en `cargarLogoBase64`). Texto: nombre razón social, dirección Miami Beach, teléfono `786-253-7983`, email `akconciergeservices@gmail.com`. **No editable** desde la UI. El mismo bloque se usa en el PDF final.

#### 2. Número de factura (editable)

- Al abrir el panel para una factura nueva, el input se **pre-fillea** llamando `siguiente_numero_factura()` (RPC actual — devuelve y avanza el counter).
- Andy puede sobrescribir el número (backdating, saltear huecos, corregir un número manual).
- Al hacer click en **Save Draft** o **Generate Final PDF**, antes de cualquier escritura el front consulta si el número ya existe en `facturas` (estado distinto a `'anulada'`).
- Si existe: modal "El número X ya está usado por la factura del cliente Y. ¿Cambiar el número o continuar con duplicado bajo tu responsabilidad?" con 3 opciones:
  - **Cambiar**: cierra el modal, devuelve foco al input. No graba nada.
  - **Forzar duplicado**: continúa el flujo. Graba `duplicado_forzado = true` y `creado_por_duplicado_forzado = usuario_id` (audit).
  - **Cancelar**: cierra y vuelve.
- Si el número que tipeó Andy **no avanza el counter** (porque tipeó uno menor o saltó varios), no se llama `devolver_numero_factura()` ni se ajusta el counter — se acepta el hueco. La próxima factura usará lo que devuelva `siguiente_numero_factura()` (que sigue siendo `proximo_numero`).
- Si tipeó uno **mayor o igual** al counter actual, se actualiza `factura_counter.proximo_numero = numero_usado + 1` para evitar que la próxima factura colisione automáticamente (función nueva `set_numero_factura_minimo(p_numero integer)`).

Notas:
- El RPC `siguiente_numero_factura()` actual hace `UPDATE … RETURNING proximo_numero` con `FOR UPDATE` y **avanza el counter aunque después no se use**. Para que el pre-fill no consuma huecos, el spec usa una variante nueva **`sugerir_numero_factura()`** que hace `SELECT proximo_numero` sin UPDATE. El UPDATE ocurre solamente al hacer Save / Generate Final (con un `set_numero_factura_minimo` que actualiza el counter al `max(numero_usado + 1, proximo_numero)`).

#### 3. Bill To + For (dos columnas)

**Bill To** (izquierda):
- Dropdown `Client` (mismo `listarClientesActivos()` que ya existe).
- Al seleccionar, **pre-fill** de `bill_to_name`, `bill_to_email`, `bill_to_address_1/2`, `bill_to_city`, `bill_to_state`, `bill_to_zip` desde la tabla `clientes`.
- Los 5 inputs quedan editables (Andy puede corregir para esta factura puntual sin tocar el cliente).
- Fallback: si el cliente no tiene `bill_to_name`, prefill con `razon_social || (nombre + apellido)`.

**For** (derecha):
- Dropdown `Property` (nuevo) — se carga al elegir cliente, filtra `propiedades.cliente_id`.
- Al seleccionar, prefill: `for_property` = `nombre_referencia` + unidad (si la hay), `for_service_period` queda vacío para que Andy tipee ("May 2026", "Sept 1–15", etc).
- Inputs editables.

Estos datos solo se **persisten como snapshot** (`bill_to_*_snapshot` y nuevos `for_*_snapshot`) al hacer **Generate Final**. Mientras la factura es borrador, viven en la tabla `facturas` en columnas regulares (que se sobreescriben en cada Save Draft).

#### 4. Items (pre-load desde OS)

**Auto-load**: al seleccionar `cliente + propiedad`, el sistema busca las **OS de esa propiedad** con `estado IN ('completada', 'confirmada')` que **no estén ya facturadas en una factura no anulada** (ver edge case 1).

Cada OS se carga como **una línea**:
- `fecha` = `programada_en::date` de la OS
- `descripcion` = `tipo de servicio + propiedad + fecha legible`, ej: "Cleaning · Alfonsina 4B · May 5, 2026"
- `qty` = 1
- `precio_unitario` = `costo_final` (o `costo_estimado` si `costo_final` es NULL)
- `os_id` = id de la OS (para tracking)
- Checkbox a la izquierda **tildado por defecto** — Andy puede destildar líneas que no quiere facturar este mes.

Botón **"+ Agregar ítem manual"** agrega una fila vacía editable (`os_id = NULL`). Todas las líneas son editables incluso después del pre-load (descripción, qty, precio).

**Decisión cerrada**: Opción B confirmada — una OS = una línea (NO se hace fan-out a `os_servicios`). Si Andy necesita más granularidad puede borrar la línea y agregar manualmente.

#### 5. Total

`subtotal = Σ qty × precio_unitario` de líneas tildadas. `total_due = subtotal` (sin tax/discount en V2 — campos quedan en 0). Se recalcula reactivo en cada keystroke (Alpine `x-text` con getter `totalDue`).

#### Botones

**Save Draft**:
1. Validar número (no vacío, entero positivo).
2. Check de duplicado contra `facturas.numero` (excluyendo `anuladas`, y excluyendo `id` actual si es edición).
3. Si duplicado → modal "Cambiar / Forzar / Cancelar".
4. Si OK o forzado: `crearFactura` (con `numero`, `duplicado_forzado`, `bill_to_*` en columnas regulares) o `actualizarFactura` (con version check). Estado queda `'borrador'`.
5. `set_numero_factura_minimo(numero)` para mover el counter si corresponde.
6. Toast "Draft saved #1042" y mantener el panel abierto.

**Generate Final PDF**:
1. Mismas validaciones + duplicate check.
2. Si la factura todavía no existe en DB, primero `crearFactura` (borrador con `numero`).
3. Snapshot: copiar `bill_to_*` (de los inputs editables, no del cliente original) a `bill_to_*_snapshot` y `for_*` a `for_*_snapshot`.
4. `actualizarFactura` con `estado='generada'` + snapshots + numero + version check.
5. Render HTML (`renderizarHTMLPDF` reutilizable, recibe data del state local — no requiere re-fetch).
6. html2pdf → blob.
7. Upload Storage `facturas/<año>/<numero>.pdf` (`subirPDF`).
8. `actualizarPdfUrl`.
9. Mostrar modal preview con iframe + Download (igual que hoy).
10. Si **cualquier paso 5–8 falla** después de marcar `estado='generada'`: rollback con `revertirABorrador(id)` (no se llama `devolver_numero_factura()` porque V2 no consume el counter de forma estricta; el número queda asignado al borrador hasta que Andy lo cambie o anule).

---

## Cambios al schema

### Columnas a agregar

```sql
-- En facturas
ALTER TABLE facturas ADD COLUMN duplicado_forzado boolean NOT NULL DEFAULT false;
ALTER TABLE facturas ADD COLUMN propiedad_id uuid REFERENCES propiedades(id);
-- Snapshots FOR (paralelos a los bill_to_*_snapshot existentes)
ALTER TABLE facturas ADD COLUMN for_property_snapshot       text;
ALTER TABLE facturas ADD COLUMN for_service_period_snapshot text;
ALTER TABLE facturas ADD COLUMN for_description_snapshot    text;

-- Bill_to en columnas regulares (estado borrador) — hoy se reusa descripcion_general; V2 lo separa
ALTER TABLE facturas ADD COLUMN bill_to_name       text;
ALTER TABLE facturas ADD COLUMN bill_to_email      text;
ALTER TABLE facturas ADD COLUMN bill_to_address_1  text;
ALTER TABLE facturas ADD COLUMN bill_to_address_2  text;
ALTER TABLE facturas ADD COLUMN bill_to_city       text;
ALTER TABLE facturas ADD COLUMN bill_to_state      text;
ALTER TABLE facturas ADD COLUMN bill_to_zip        text;
ALTER TABLE facturas ADD COLUMN for_property         text;
ALTER TABLE facturas ADD COLUMN for_service_period   text;
ALTER TABLE facturas ADD COLUMN for_description      text;
```

### Constraints a quitar/ajustar

- **Si existe** `UNIQUE (numero)` o índice único en `facturas.numero` → **quitarlo**. El duplicate-check pasa a ser responsabilidad de la aplicación (consulta previa + columna `duplicado_forzado`). Verificar en Supabase:
  ```sql
  SELECT conname FROM pg_constraint WHERE conrelid = 'facturas'::regclass AND contype = 'u';
  SELECT indexname FROM pg_indexes WHERE tablename = 'facturas' AND indexdef ILIKE '%unique%numero%';
  ```
- **Mantener** `fn_proteger_factura_emitida()`: ya permite editar `numero` SOLO si la factura no está en `enviada`/`pagada`, lo cual es compatible con V2.
- Considerar **CHECK** opcional: `CHECK (numero IS NULL OR numero > 0)`.

### Functions/triggers a revisar

- **`siguiente_numero_factura()`** → mantener como está (consume y avanza counter). Se sigue usando solo desde `set_numero_factura_minimo` y como fallback si Andy borra todo el input.
- **Nueva: `sugerir_numero_factura()`** — `SELECT proximo_numero FROM factura_counter WHERE id = 1`. Sin UPDATE. Se usa para el pre-fill del input al abrir el panel.
- **Nueva: `set_numero_factura_minimo(p_numero integer)`** — `UPDATE factura_counter SET proximo_numero = GREATEST(proximo_numero, p_numero + 1) WHERE id = 1`. Idempotente. Se llama después de Save Draft / Generate Final.
- **`devolver_numero_factura(p_numero)`** → seguir disponible pero ya **no se invoca automáticamente** en el flujo V2 (porque el counter avanza solo desde `set_numero_factura_minimo`). Queda como herramienta manual.
- **`trg_incrementar_version`** → sigue sirviendo, NO tocar.
- **`fn_proteger_factura_emitida`** → revisar si conviene agregar `propiedad_id`, `bill_to_*`, `for_*` y `duplicado_forzado` a la lista de campos protegidos cuando estado in (`enviada`, `pagada`).

### Storage

- Mantener bucket `facturas/<año>/<numero>.pdf`. Si Andy guarda dos facturas con el mismo número (duplicado forzado), el `upsert: true` actual del upload **sobreescribe**. Para evitar pérdida del primer PDF, el path en V2 incluye el `id`:
  ```
  facturas/<año>/<numero>__<short-uuid>.pdf
  ```
  donde `<short-uuid>` = primeros 8 chars de `factura.id`. Si no hay duplicado, también se aplica este patrón por consistencia.

---

## Cambios al código

### `panel/invoices/js/invoices-api.js`

**Funciones nuevas:**
- `sugerirNumeroFactura()` → llama RPC nueva `sugerir_numero_factura()`. Retorna `{ numero, error }`.
- `numeroFacturaExiste(numero, excluirId = null)` → `SELECT id, cliente_id, estado FROM facturas WHERE numero = $1 AND estado <> 'anulada' AND (id <> $2 OR $2 IS NULL) LIMIT 1`. Retorna `{ existe: boolean, factura, error }`.
- `setNumeroFacturaMinimo(numero)` → llama RPC `set_numero_factura_minimo(p_numero)`. Retorna `{ error }`.
- `listarPropiedadesDeCliente(cliente_id)` → SELECT `id, nombre_referencia, unidad, edificio_id, edificios(nombre)` de `propiedades` donde `cliente_id = $1 AND activa = true`. Para el dropdown FOR.
- `listarOSFacturablesDePropiedad(propiedad_id, excluirFacturaId = null)` → SELECT OS `WHERE propiedad_id = $1 AND estado IN ('completada','confirmada') AND id NOT IN (SELECT os_id FROM factura_lineas WHERE os_id IS NOT NULL AND factura_id IN (SELECT id FROM facturas WHERE estado <> 'anulada' AND id <> $2))`. Embebe `os_servicios → servicios(nombre_en)` para construir la descripción. Retorna OS con `costo_final`, `programada_en`, descripción tentativa.

**Funciones a modificar:**
- `crearFactura(datosFactura, lineas)` → acepta `numero`, `duplicado_forzado`, `propiedad_id`, `bill_to_*`, `for_*` directamente. Estado inicial sigue `'borrador'`.
- `actualizarFactura(id, datosFactura, lineas, version)` → idem. Mantener el reemplazo de líneas (delete + insert), pero ahora cada línea puede llevar `os_id`.
- `generarNumeroYSnapshot(id, version, snapshotData)` → renombrar a `marcarComoGenerada(id, version, snapshotData)`. **YA NO** llama `siguiente_numero_factura()` (el número ya está en la factura desde el Save Draft). Solo hace el UPDATE con `estado='generada'` y los snapshots `bill_to_*_snapshot` + `for_*_snapshot`.
- `subirPDF(numero, año, blob)` → cambiar firma a `subirPDF(facturaId, numero, año, blob)` y usar path `<año>/<numero>__<id8>.pdf`.
- `obtenerClienteParaFactura` → ampliar select para `telefono`, etc., si hace falta para el PDF (revisar el template actual). En principio queda igual.

**Funciones a borrar (dead code después del refactor):**
- `devolverNumero` y `revertirABorrador` → el flujo V2 no los necesita en el happy/sad path normal. Dejarlas como helper interno solo si Anular requiere rollback, pero la dependencia con `devolver_numero_factura()` desaparece.

### `panel/invoices/index.html`

El componente Alpine `invoicesPage()` se refactoriza así:

- **Estado nuevo**:
  ```js
  formData: {
    id, numero, cliente_id, propiedad_id, fecha,
    bill_to_name, bill_to_email, bill_to_address_1, bill_to_address_2,
    bill_to_city, bill_to_state, bill_to_zip,
    for_property, for_service_period, for_description,
    notas, estado, version, duplicado_forzado
  }
  lineas: [{ id?, fecha, descripcion, qty, precio_unitario, os_id, incluida }]
  propiedadesDropdown: []
  osDisponibles: []           // pre-load cache
  modalDuplicado: { abierto, numeroExistente, facturaExistente, resolver }
  ```
- **Métodos nuevos**:
  - `async onClienteChange()`: refetch `propiedadesDropdown`, limpiar `propiedad_id`, prefill `bill_to_*` desde el cliente.
  - `async onPropiedadChange()`: refetch `osDisponibles`, prefill `for_property`, materializar líneas desde OS.
  - `async onNumeroChange()`: debounce 300ms, llamar `numeroFacturaExiste` y mostrar warning inline (no modal — el modal solo aparece al guardar).
  - `async checkDuplicadoAntesDeGuardar()`: si existe y no es la misma id, abrir `modalDuplicado` y retornar el resultado de la promesa.
  - `async guardar()`: integrar `checkDuplicadoAntesDeGuardar`, `setNumeroFacturaMinimo` post-save.
  - `async generarFinal()`: igual al guardar pero después dispara render PDF + upload. Renombrar `generarNumeroYSnapshot` → `marcarComoGenerada` en el call.

- **Markup**:
  - Reemplazar el modal grande por un componente embebido (`<aside class="invoice-editor">`) que se muestra cuando `modalAbierto`.
  - Header fijo nuevo (logo + datos AK) arriba del editor.
  - Input `<input type="number" x-model="formData.numero" @input.debounce.300ms="onNumeroChange()">` con badge "Duplicate" si aplica.
  - Dropdown `Property` filtrado por cliente.
  - Tabla `Items` con checkbox `incluida` y fila resaltada cuando `os_id != null` (badge "from OS #N").
  - Botones inferior: "Save Draft" y "Generate Final PDF" (sin botón "Generate Final" separado del Save).

- **Modal de duplicado** (nuevo, anidado):
  ```html
  <div class="modal-overlay" x-show="modalDuplicado.abierto" ...>
    <div class="modal-form" style="max-width: 480px">
      Number #1042 is already used by invoice for "Acme Inc" (May 1).
      [Change number]  [Force duplicate]  [Cancel]
    </div>
  </div>
  ```

### Tests manuales que Andy/Leonardo deben correr

1. Crear factura nueva sin tocar nada → input pre-rellena con el counter actual.
2. Editar el número a uno mayor (ej +5) → guardar → counter avanzó al `numero+1`.
3. Editar el número a uno menor que el counter → guardar → counter no se mueve.
4. Tipear un número usado por una factura "generada" → modal aparece → forzar → factura guarda con `duplicado_forzado = true`.
5. Tipear un número usado por una factura "anulada" → modal NO aparece (anuladas se excluyen del check).
6. Elegir cliente con 3 OS completadas en el mes → ver 3 líneas pre-cargadas, todas tildadas.
7. Destildar una línea → Total se recalcula sin esa línea.
8. Generate Final → preview PDF tiene el número editado y los snapshots correctos.

---

## Edge cases

### 1. OS ya asociada a otra factura

**Decisión**: NO se permite duplicar por default. `listarOSFacturablesDePropiedad` excluye las OS que ya tienen `factura_lineas.os_id` apuntándolas, excepto si la factura que las contiene está `anulada`.

Excepción: Andy puede agregar manualmente una línea con `+ Agregar ítem` y referenciar la OS por descripción libre. Si necesita re-facturar una OS explícitamente, primero anula la factura vieja (libera la OS).

**Implementación**: el SELECT de pre-load incluye `NOT EXISTS (SELECT 1 FROM factura_lineas fl JOIN facturas f ON fl.factura_id = f.id WHERE fl.os_id = ordenes_servicio.id AND f.estado <> 'anulada' AND f.id <> :excluirFacturaId)`.

### 2. Anular una factura con número duplicado forzado

`anularFactura` mantiene el comportamiento actual: estado → `anulada`, sin tocar `numero`. No se llama `devolver_numero_factura()` (el counter en V2 no se "devuelve" porque no se consumió de manera estricta).

Si la factura anulada tenía `duplicado_forzado=true`, ese flag queda como histórico para audit.

### 3. Falla el upload PDF a Storage después de Generate Final

Como V2 ya marcó `estado='generada'` y guardó el snapshot **antes** del upload, el rollback en caso de error de Storage debe:

1. NO devolver el número al counter (el counter ya fue actualizado por `set_numero_factura_minimo` en Save Draft anterior, y el `numero` queda asignado a la factura).
2. Revertir estado a `'borrador'` con `revertirABorrador(id)` **pero sin borrar el numero** (modificar `revertirABorrador` para que solo cambie `estado='borrador'`, manteniendo `numero`).
3. Toast de error: "PDF generation failed. The invoice was saved as draft with number #N — you can retry from the editor."

### 4. Multi-currency

**V2 = solo USD.** Todos los montos y el PDF asumen USD. No hay UI ni columnas para currency.

Para preparar el terreno V3, agregar columna ahora:
```sql
ALTER TABLE facturas ADD COLUMN moneda text NOT NULL DEFAULT 'USD'
  CHECK (moneda IN ('USD'));  -- ampliar el CHECK cuando se sumen otras
```
El template PDF hardcodea `$` como hoy. No se expone selector en la UI.

### 5. Andy borra el input de número y deja vacío

Validación bloquea Save / Generate. Toast: "Invoice number is required." (No se llama `sugerir_numero_factura()` automáticamente — el espacio en blanco es señal de intencionalidad del usuario.)

### 6. Concurrencia: Andy y Leonardo editan la misma factura

Se mantiene el `version`-check existente (`trg_incrementar_version`). El check de duplicado se hace al momento del save, no al cargar — es racy pero el caso es de muy baja probabilidad y el peor escenario es que ambos terminen con `duplicado_forzado=false` apuntando al mismo número, lo cual es detectable en audit.

### 7. Cliente sin `bill_to_*` cargado

Fallback de prefill:
- `bill_to_name` ← `clientes.razon_social || trim(nombre + ' ' + apellido)`
- `bill_to_email` ← `clientes.email`
- Demás campos quedan vacíos (Andy los completa o no — son opcionales en el PDF).

Esto es idéntico al fallback que ya hace `generarFinal()` hoy en la línea de armar `snapshotData`.

### 8. Propiedad sin OS facturables

Si `listarOSFacturablesDePropiedad` retorna 0 filas → tabla Items queda con una fila vacía manual. Mensaje sutil arriba de la tabla: "No facturable service orders for this property in the selected period — add items manually."

### 9. Andy cambia de cliente con líneas ya cargadas

Mostrar `confirm()`: "Changing the client will remove the pre-loaded items from the previous selection. Continue?" Si sí, limpiar `lineas` (solo las que tienen `os_id != null`; las manuales se conservan).

---

## Out of scope (V3+)

- Recurrencias automáticas / facturación mensual masiva.
- Multi-currency real.
- Plantillas de factura (ej: "Cleaning mensual estándar").
- Envío automático por email (`facturas_outbox`).
- Notas de crédito desde el editor (queda como flujo separado).
- Detección automática de período de servicio basada en fechas de OS.
