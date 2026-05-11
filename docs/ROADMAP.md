# Roadmap — Próximos bloques

## Regla operativa
**Planificar conversacionalmente antes de codear.**
Cuando Leonardo diga "vamos con Bloque X", primero:
1. Listar las features del bloque.
2. Preguntar decisiones abiertas (UX, scope, dependencias).
3. Solo cuando esté claro: generar archivos en etapas chicas.

## Bloque J — Invoicing (EN PROGRESO)

### Etapa 1 ✅ DONE — validada en Brave (commit `8f0db13`)
Drafts ABM: lista con tabs, búsqueda, filtro cliente, CRUD, líneas manuales, Total Due en vivo.

### Etapa 2 ✅ CODEADA — pendiente validación en Mac (commit `02ae9c5`)
Generate Final + PDF (html2pdf.js) + Storage upload + preview modal + Void + Download.
Fix del bug `<input type="date">`. Rollback completo si falla post-numeración.
Ver `docs/PENDIENTES.md` para checklist de validación.

### Etapa 3 — pendiente
Selección de OS no facturadas: listar OS completadas no facturadas del cliente,
checkbox para incluir, auto-populate líneas desde `os_servicios`.

### Etapa 4 — pendiente
Send to Client (email via SendGrid Edge Function) + registro de pagos (`factura_pagos`).

---

### Decisión clave
**Facturación V1 = MANUAL**. Andy decide cuándo facturar, no hay trigger automático al completar OS. Razón: en V1 prima el control humano; el outbox/worker automático queda para V2.

### Datos de empresa AK (para header de invoice)
- **Razón social**: AK Property Management Concierge Services
- **Nombre corto**: AK Concierge
- **Website**: www.akconciergeservices.com
- **Email**: akconciergeservices@gmail.com
- **Tel**: 786-253-7983
- **Dirección**: Miami Beach, FL 33140

### Datos bancarios (footer del invoice)
- **Bank**: Citibank
- **Routing**: 266086554
- **Account**: 9135063896
- **SWIFT**: CITIUS33
- **Payable to**: AK Property Management Concierge Services

### Contacto facturación (footer)
- Andrea Manca · 786-253-7983 · andyflo@hotmail.com

### Numeración
- Tabla `factura_counter` con `FOR UPDATE` (decisión Opus A3, NO usar SEQUENCE de Postgres porque dejaría huecos legalmente problemáticos).
- Arranca en **1001**. Tabla y función **ya existen en Supabase** (11 May 2026).
- Columna real: `proximo_numero` (**NO** `siguiente_numero` como estaba documentado antes).
- Función para obtener siguiente número (usar internamente en Etapa 2):
  ```sql
  -- La tabla ya existe. La función a usar en Etapa 2:
  CREATE OR REPLACE FUNCTION siguiente_numero_factura() RETURNS int AS $$
  DECLARE nro int;
  BEGIN
    UPDATE factura_counter
    SET proximo_numero = proximo_numero + 1
    WHERE id = 1
    RETURNING proximo_numero - 1 INTO nro;
    RETURN nro;
  END;
  $$ LANGUAGE plpgsql;
  ```
- Función de rollback ya creada: `devolver_numero_factura(p_numero integer) RETURNS boolean`

### Schema de tablas (verificar en Supabase, crear si faltan)

```sql
-- facturas — YA EXISTE en Supabase con el schema real verificado 11 May 2026.
-- Columnas reales: fecha (no fecha_emision), total_due (no total),
-- enviada_a (no enviada_a_email), bill_to_*_snapshot (no bill_to_nombre/direccion).
-- El CREATE TABLE de referencia está en docs/SCHEMA.md.

-- factura_lineas — YA EXISTE. Columna real: qty (no cantidad).
-- El schema completo está en docs/SCHEMA.md.

-- factura_pagos
CREATE TABLE factura_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid REFERENCES facturas(id) NOT NULL,
  monto numeric(12,2) NOT NULL,
  metodo text,
  referencia text,
  fecha_pago date NOT NULL,
  notas text,
  creado_por uuid REFERENCES usuarios(id),
  creado_en timestamptz DEFAULT now()
);

-- notas_credito (refunds, V1.5)
CREATE TABLE notas_credito (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid REFERENCES facturas(id) NOT NULL,
  numero int UNIQUE,
  monto numeric(12,2) NOT NULL,
  motivo text,
  fecha date NOT NULL,
  creado_por uuid REFERENCES usuarios(id),
  creado_en timestamptz DEFAULT now()
);
```

### Flujo MANUAL de facturación (11 pasos)
1. Andy abre módulo Facturas → "Nueva factura"
2. Selecciona cliente → sistema lista OS completadas no facturadas
3. Andy tilda cuáles incluir (1 OS o varias del mes)
4. Sistema precarga líneas con `os_servicios` (descripción + cantidad + precio del tarifario al momento)
5. Andy puede:
   - Agregar líneas manuales (ej "Reimbursement for purchases - $45")
   - Modificar precios y descripciones
   - Tildar/destildar `taxable` por línea
   - Aplicar descuento por línea
6. Sistema calcula subtotal + tax + total en vivo
7. Andy completa periodo_servicio (ej "September 2025")
8. "Preview PDF" → ve preview sin asignar número todavía (estado='borrador')
9. "Generate Final" → llama `siguiente_numero_factura()`, asigna número, genera PDF, estado='generada'
10. Andy descarga PDF y revisa
11. "Send to Client" → manda email + marca estado='enviada' + guarda email destino + timestamp

Dashboard sugiere "X OS completadas listas para facturar" pero NO genera nada solo.

### Items mínimos del módulo Bloque J

**Lista**:
- Tabs: Drafts / Generated / Sent / Paid / All
- Filtros: cliente, mes, estado
- Búsqueda por número o cliente
- Columna estado, fecha, cliente, total

**Modal nuevo**:
- Step 1: seleccionar cliente
- Step 2: listar OS no facturadas + checkbox para incluir
- Step 3: editor de líneas (reordenar, editar inline)
- Step 4: totales + tax + descuento + notas
- Botones: Save Draft / Preview / Generate Final

**Vista detalle invoice**:
- Render HTML con paleta AK
- Botón "Download PDF" (html2pdf.js en cliente)
- Botón "Send to Client" (precarga email a contactos con `recibe_facturas=true`)
- Botón "Mark as Paid" → modal de registro de pago
- Historial de pagos parciales

### Preguntas abiertas a Andy (PENDIENTE de respuesta)
1. ¿AK tiene Florida sales tax certificate? ¿Qué servicios cobran tax? (Miami-Dade tax estimado ~7%)
2. ¿Cómo cobran hoy? (wire, Zelle, ACH, check, Stripe) → define qué métodos listar en pagos
3. ¿Tienen contador? ¿QuickBooks? → define si hay que prever export CSV/JSON

**Plan provisorio**: avanzar con defaults (todos los servicios `taxable=false` por default, métodos de pago: wire, zelle, ach, check; sin export QB en V1).

### Email y PDF
- **Email**: SendGrid vía Edge Function `send-invoice`. Pendiente: configurar dominio sender, key API en secrets de Supabase.
- **PDF**: html2pdf.js en cliente (más simple, evita roundtrip al servidor).

---

## Después de J

| Bloque | Módulo | Por qué importa | Dificultad |
|--------|--------|-----------------|------------|
| K | Field Reports | Comunicación operativa staff → admin | Media |
| L | App Empleada (PWA) | Staff marca tareas en celular | Alta |
| M | App Proveedor (PWA) | Proveedores reportan + OS hijas | Media |
| N | Purchasing | Cierre de gastos (depende de K) | Baja |
| O | Settings + System Admin | Configuración final | Baja |

### Bloque K — Field Reports
- Empleadas/Proveedores crean reporte vinculado a OS o propiedad
- Tipos: insumo faltante, daño, otro
- Urgencia: baja/media/alta
- Fotos vía Supabase Storage
- Estado: nuevo/visto/en gestión/resuelto
- Notificación a admin si urgencia=alta

### Bloque L — App Empleada (PWA)
- Mobile-first, bilingüe (es/en)
- Login con email/password (ya creado en Bloque E)
- Agenda del día (sus OS asignadas)
- Detalle de OS: dirección + acceso + checklist
- Marcar items completados; crear field reports con foto
- **RLS crítico**: empleada solo ve sus propias OS asignadas → policy específica B2 review Opus

### Bloque M — App Proveedor (PWA)
- Similar a L pero para proveedores
- Puede sugerir OS hijas ("requiere trabajo adicional"), admin confirma
- Bilingüe

### Bloque N — Purchasing
- Lista de compras pendientes; recibe inputs de field reports (insumo faltante)
- Tarea asignada a rol `compras`
- Estado: pendiente_revision / aprobada / en_compra / entregada

### Bloque O — Settings + System Admin
- Configuración empresa (logo upload, datos bancarios editables)
- System Health (cuentas activas, espacio Storage, errores recientes)
- Audit Log viewer (lectura de tabla `audit_log`)
- Configuration (timezone, idioma default, secrets de email)

---

## V2 (después de V1 estable con Andy)
- Facturación automática con outbox + worker (schema ya preparado con `facturas_outbox`)
- WhatsApp notifications (vía Meta Cloud API o Twilio)
- Portal cliente (Andy le da acceso a clientes para ver sus OS y facturas)
- LLM para compras automáticas (sugerir proveedor por item)
- QuickBooks export (si Andy lo usa)
- Recurrencias automáticas (tabla `recurrencias` ya en schema, decisión A5)
- Google Calendar sync
- Tarifas por cliente (override del tarifario por servicio)

---

## Review crítico de Opus — referencia rápida

Cuando estés diseñando algo nuevo, revisá si toca alguna de estas decisiones:

### Tier 1 — Schema (ya aplicadas en V1)
- A2: `os_asignados` con XOR empleada/proveedor (no polimórfico)
- A4: OS:servicios M:M vía `os_servicios`
- A5: `recurrencias` separada
- A8: Direcciones estructuradas
- A9: Clientes con tipo (individual/business/trust/llc) + bill_to
- A11: `actualizado_en`, `actualizado_por`, `audit_log`
- A13: Índices completos
- C4: TIMESTAMPTZ con tz Miami default
- D5: `factura_lineas.os_id` para consolidación mensual

### Tier 2 — Schema preparado, lógica diferida
- A1: tarifario `servicio_tarifas` con vigencias ✅ en uso
- A3: numeración con tabla counter FOR UPDATE (no SEQUENCE)
- A6: pagos parciales `factura_pagos`
- A7: refunds `notas_credito`
- C1+D2: outbox pattern facturación
- C2: optimistic locking via `version`
- C3: idempotency_key UNIQUE en facturas
- D1: sales tax por línea (taxable, tax_pct, tax_monto, descuento)
- D7: W9/1099 en proveedores

### Top 5 críticos absolutos (orden de daño en prod)
1. **A1** — sin pricing, facturación es manual y error-prone
2. **A2** — RLS y FKs rotas por polimorfismo
3. **B2+B3+B4** — RLS rota para empleadas/proveedores → PWAs no funcionarán sin esto resuelto
4. **C1+C4+D2** — atomicidad facturación
5. **C4** — timezone (costoso de migrar después)
