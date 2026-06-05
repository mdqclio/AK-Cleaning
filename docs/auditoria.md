# Auditoría de Seguridad y Calidad — AK Property Management System

**Fecha:** 2026-06-05
**Auditor:** Análisis automatizado profesional (Claude — Opus 4.8)
**Alcance:** Todo el repositorio `AK-Cleaning` (~11.000 líneas, 60+ archivos)
**Stack auditado:** HTML vanilla + Alpine.js + Supabase (Postgres + Auth + RLS) · GitHub Pages
**Método:** Lectura completa del núcleo (auth, router, config, supabase-client, migraciones, panel-shell) + análisis paralelo por módulo (invoices, orders, services, clients, properties, providers, staff, users, system).

---

## ⚠️ Resumen ejecutivo

El sistema tiene **defectos de seguridad CRÍTICOS que permiten que cualquier usuario autenticado de bajo privilegio (empleada/proveedor) escale a `superadmin`** y tome control total del sistema. La causa raíz es una decisión arquitectónica de fondo:

> **Toda la autorización vive en el cliente (JavaScript). La capa server-side (RLS) está incompleta y, donde existe, no está versionada en el repo. Dos RPCs `SECURITY DEFINER` están expuestos a cualquier usuario autenticado sin validación.**

Mientras esto no se corrija, **ninguna restricción de rol es efectiva**: cualquier persona con una cuenta puede leer/escribir todos los datos (clientes, propiedades, finanzas) y elevar su propio rol.

### Conteo de hallazgos

| Severidad | Cantidad | Acción |
|-----------|----------|--------|
| 🔴 CRÍTICO | 6 | Arreglar YA — antes de cualquier uso real con datos sensibles |
| 🟠 ALTO | 14 | Arreglar esta semana |
| 🟡 MEDIO | 17 | Planificar |
| 🟢 BAJO | 13 | Backlog / mejora continua |

---

## 🔴 CRÍTICOS — Escalada de privilegios y toma de cuentas

Estos 6 son la prioridad absoluta. Todos giran alrededor del mismo problema: **el servidor confía en lo que manda el cliente.**

| # | Archivo:Línea | Tipo | Problema | Fix |
|---|---------------|------|----------|-----|
| C1 | `migrations/006_..._actualizar_perfil_post_signup.sql:38` (GRANT) | Seguridad | RPC `SECURITY DEFINER` con `GRANT EXECUTE TO authenticated`. **Cualquier usuario logueado** puede llamarlo con su propio `p_auth_id` y `p_rol='superadmin'` → reescribe su fila en `usuarios` bypaseando RLS → **escalada total**. No verifica quién llama ni valida el rol. | Guard al inicio: `IF NOT tiene_acceso_admin() THEN RAISE EXCEPTION`. Whitelist de `p_rol`. Verificar `auth.uid()` del invocador. |
| C2 | `migrations/007_..._crear_empleada_post_signup.sql:53` (GRANT) | Seguridad | Mismo patrón. RPC `SECURITY DEFINER` ejecutable por cualquier `authenticated`, sin chequear que el caller sea admin/owner. Permite asignar roles arbitrarios y crear empleadas. | Mismo guard `tiene_acceso_admin()` + whitelist de rol. |
| C3 | `migrations/005_...security_definer.sql:25-33` | Seguridad/Lógica | Trigger `fn_handle_new_user`: `ON CONFLICT (email) DO UPDATE SET auth_id = EXCLUDED.auth_id`. Si ya existe una fila con ese email (p.ej. las 17 empleadas precargadas sin `auth_id`, o el owner Andy), **un signup con ese email reapunta la fila al `auth_id` del atacante** → toma de cuenta + rol existente. | No reasignar `auth_id` en conflicto: `... DO UPDATE ... WHERE usuarios.auth_id IS NULL`, o rechazar signup si el email ya existe. |
| C4 | `panel/users/js/users-api.js:98-111` (`actualizarUsuario`) | Seguridad | `update({rol})` directo sobre `usuarios` confiando 100% en RLS (que está pendiente per CLAUDE.md). `rol` se toma del `<select>` del cliente, manipulable por petición directa. | Cambios de `rol` solo vía RPC `SECURITY DEFINER` con auth del caller + whitelist. RLS que impida setear `rol` a valores no permitidos / `superadmin`. |
| C5 | `panel/staff/js/staff-api.js:149-154` (`actualizarEmpleada`) | Seguridad | Igual que C4: `update({rol})` directo desde el cliente. El `<select>` no ofrece `superadmin`/`owner`, pero la API acepta cualquier `rol` por petición manipulada. | Validar rol en servidor. **Las `<option>` del select NO son control de seguridad.** |
| C6 | `migrations/006:15`, `007:17` (`p_rol`) | Seguridad | Ningún RPC valida `p_rol` contra un set cerrado. Se acepta cualquier string, incluido `'superadmin'`. | `IF p_rol NOT IN ('owner','admin','compras','empleada','proveedor') THEN RAISE EXCEPTION`. Prohibir `'superadmin'` desde estos RPCs. |

### Cadena de explotación (proof of concept conceptual)

1. Atacante obtiene cualquier cuenta (o se auto-registra si el signup público está habilitado en Supabase — **verificar esto YA**).
2. Desde la consola del browser, con la sesión activa:
   ```js
   await supabase.rpc('actualizar_perfil_post_signup', {
     p_auth_id: (await supabase.auth.getUser()).data.user.id,
     p_nombre: 'x', p_apellido: 'x', p_telefono: 'x',
     p_rol: 'superadmin'
   })
   ```
3. Ahora es superadmin. Acceso total.

**`window.supabase` está expuesto en consola (`supabase-client.js:18`), lo que facilita exactamente este ataque.**

---

## 🏛️ Problema arquitectónico raíz (leer antes de arreglar lo demás)

| Hallazgo | Detalle |
|----------|---------|
| **Autorización 100% client-side** | `protegerRuta()` (router.js), `menuParaRol()` (panel-config.js:61), `puedeVerDinero()` (panel-config.js:78) y los `<select>` con opciones limitadas son **solo UX**. El propio código y CLAUDE.md admiten "No es seguridad real — RLS pendiente". Un usuario puede llamar las APIs directamente (`listarUsuarios`, `crearFactura`, etc.) o navegar a la URL. |
| **RLS no versionada** | Las migraciones del repo (005/006/007) solo contienen funciones/triggers. **No hay un solo `CREATE POLICY` en el repo.** Las policies se aplicaron a mano en el dashboard de Supabase → no auditables, no reproducibles, no hay forma de verificar qué protege realmente la base. Riesgo: nadie sabe el estado real de seguridad de la DB. |
| **Datos sensibles filtrados en el SELECT** | `puedeVerDinero` oculta `tarifa_hora` en el DOM, pero `SELECT_EMPLEADA` igual lo trae en la respuesta → visible en Network/console para roles que no deberían verlo. Lo mismo con `superadmin` oculto: `listarUsuarios` lo filtra con `.in(ROLES_GESTIONADOS)` en el cliente, pero un SELECT directo enumera la cuenta del vendor (Leonardo). |

**Recomendación estructural:** Antes de seguir agregando módulos, **escribir y versionar todas las RLS policies** (un archivo `migrations/0XX_rls_policies.sql`), exportar las existentes desde Supabase, y mover toda creación de cuentas / cambio de rol a Edge Functions con `service_role` que NO toquen la sesión del admin en el browser.

---

## 🟠 ALTOS

### Seguridad

| Archivo:Línea | Tipo | Problema | Fix |
|---------------|------|----------|-----|
| `config.js:29-35` | Seguridad | **Datos bancarios reales** (routing `266086554`, account `9135063896`, SWIFT) hardcodeados en un archivo público servido por GitHub Pages. Cualquiera con la URL los lee, sin login. | Mover datos bancarios a tabla protegida por RLS o a config server-side. No deben estar en JS público. |
| `panel/invoices/print.html:99-115` | Seguridad | IDOR: `factId` viene de la URL y va directo a `obtenerFactura()`. La página solo verifica que haya sesión, no autorización. Si RLS no restringe, cualquier autenticado itera IDs y ve facturas ajenas (con datos bancarios incluidos, `print.html:264`). | Confirmar RLS sobre `facturas`/`factura_lineas` por rol. Filtrar también server-side. |
| `migrations/005:25-33` | Seguridad | `setTimeout` fijo (staff:97 / users:72 / providers:79) espera al trigger; si tarda más, el RPC corre antes y deja **cuenta auth huérfana** reutilizable vía el `ON CONFLICT` de C3. | Poll/reintento hasta que exista la fila, o crear la fila dentro del propio RPC. |
| `staff-api.js:86`, `users-api.js:54`, `providers-api.js:79` | Seguridad | Alta de cuenta vía `supabase.auth.signUp` desde el cliente **hijackea la sesión del admin**. El `setSession` para restaurarla es "poco confiable" (migración 007). Si falla en `finally`, el admin queda operando como el nuevo usuario de bajo privilegio sin saberlo. | Crear cuentas vía Edge Function / Admin API server-side. No usar `signUp` cliente. |
| `users-api.js:11-18` (`listarUsuarios`) | Seguridad | El filtro `.in('rol', ROLES_GESTIONADOS)` que oculta `superadmin`/`empleada` es solo cliente. SELECT directo enumera la cuenta superadmin oculta del vendor. | RLS en `usuarios` que limite SELECT según rol del caller. |
| `panel-config.js:78` (`puedeVerDinero`) | Seguridad | Campos de dinero (`tarifa_hora`) llegan en la respuesta y solo se ocultan en el DOM (`x-show`). | RLS / columnas restringidas para que no se devuelvan a roles sin permiso. |
| `auth.js:64-71` (`obtenerDatosUsuario`) | Seguridad/Lógica | A diferencia de `iniciarSesion` (que filtra `.eq('activo', true)`), la verificación de sesión NO chequea `activo`. **Un usuario desactivado mantiene acceso completo** mientras su token siga válido. | Agregar `.eq('activo', true)` en `obtenerDatosUsuario`, o validar `activo` en `protegerRuta`. |
| `orders-api.js:57`, `services-api.js:39`, `checklists-api.js:18`, `clients-api.js:13`, `properties-api.js:25`, `providers-api.js:35`, `staff-api.js:40`, `users-api.js:20` | Seguridad | **Inyección de filtro PostgREST**: `busqueda` se interpola sin escapar en `.or(...)`. Caracteres `, ) . *` rompen/alteran el filtro (ej. `foo,estado.eq.completada` inyecta condiciones). | Sanear: `busqueda.replace(/[,()*.\\%]/g,'')` antes de armar el patrón, o usar `.textSearch`. |
| `dashboard.html:11` + system/* + panel/index | Seguridad | Scripts CDN sin SRI: `unpkg.com/lucide@latest` (`@latest` = versión flotante), Alpine, Supabase (skypack), html2pdf. Un CDN comprometido ejecuta JS con acceso a la sesión. | Pinear versiones exactas + `integrity="sha384-..."` + `crossorigin`, o autoalojar. |
| `panel/system/health.html:28`, `logs.html:22` | Seguridad | **Race de auth**: `x-init="init()"` corre las consultas a la DB y las pinta en cuanto Alpine arranca (auto-start al importar el CDN), ANTES de que `protegerRuta(['superadmin'])` resuelva la redirección. El `audit_log` completo (200 filas) y los conteos se exponen momentáneamente a cualquier sesión. | Arrancar Alpine/`init()` solo después de que `iniciarPanel` confirme rol `superadmin`. |

### Bugs / Lógica (ALTO)

| Archivo:Línea | Tipo | Problema | Fix |
|---------------|------|----------|-----|
| `invoices-api.js:180-204` (`generarNumero`) | Lógica | Numeración de facturas no atómica: SELECT de `version` y UPDATE separados, sin `.eq('version', version)`. Dos clientes concurrentes consumen 2 números → número huérfano / doble numeración. **Crítico para contabilidad.** | UPDATE condicional con `.eq('version', version)` + verificar filas; mejor, RPC transaccional. |
| `invoices-api.js:124-135` (`actualizarFactura`) | Bug | Borra todas las líneas y reinserta sin transacción. Si el insert falla, **la factura queda sin líneas pero con totales ya actualizados** → factura corrupta. | Envolver delete+insert+update en RPC/transacción Postgres. |
| `invoices-api.js:337`, `index.html:830` | Lógica | Totales con aritmética float sin redondeo a 2 decimales antes de persistir. `saldo = total - pagado` da `-0.004` → muestra "Partial" cuando debería ser cero. | `Math.round(x*100)/100` por línea y total; comparar saldo con tolerancia `< 0.005`. |
| `orders-api.js:62-81` (`listarOrdenes`) | Bug | Filtro `asignado` aplicado en cliente DESPUÉS de `range()`; `count` viene de la DB sin ese filtro → paginación rota, páginas con menos filas / vacías. | Aplicar el filtro en la query (join sobre `os_asignados`) antes de `range`/`count`. |
| `orders-api.js:114-145` (`crearOrden`) | Bug | No transaccional: si falla el insert de `os_servicios`/`os_asignados`, la orden ya quedó creada → **orden huérfana/incompleta**. | RPC transaccional, o `delete` de la orden si fallan los inserts dependientes. |
| `orders-api.js:168-191` (`actualizarOrden`) | Bug | Borra `os_servicios`/`os_asignados` y reinserta sin transacción. Si el insert falla, **datos perdidos irreversiblemente**. | RPC transaccional, o insertar antes de borrar lo viejo. |
| `orders-api.js:150-164` | Lógica | Lock optimista roto: SELECT de `version` + UPDATE sin `.eq('version',version)` ni incremento. Ventana TOCTOU. | UPDATE atómico `.eq('id',id).eq('version',version)` + `version+1`, verificar filas. |
| `clients-api.js:142-148` (`guardarContactos`) | Bug/Lógica | Borra todos los contactos y luego inserta sin transacción ni chequeo de error del delete → pérdida de datos si falla el insert. | RPC transaccional; chequear error del delete. |
| `providers-api.js:74-125` (`crearProveedor`) | Bug/Lógica | Si `signUp` ok pero el `update` de `usuarios` falla → cuenta auth huérfana sin revertir. Depende de `setTimeout(500ms)` para el trigger → race. | Reintento con backoff; función server-side transaccional. |
| `properties/index.html:670` | Bug | En `guardar()` se elimina `actualizado_por` del payload pero NO `creado_por`; si hay trigger de inmutabilidad en esa columna, el UPDATE falla. | `delete datos.creado_por` también, alineado con clients. |

---

## 🟡 MEDIOS

| Archivo:Línea | Tipo | Problema | Fix |
|---------------|------|----------|-----|
| `panel-shell.js:45-76` | Seguridad | `sidebar.innerHTML` interpola `usuario.nombre/apellido/labelRol` sin escapar. Nombre con `<img onerror=...>` → **XSS almacenado** al renderizar el shell. | `textContent` o helper `escapeHtml()` antes de interpolar. |
| `auth.js:77-81` (`recuperarPassword`) | Bug | `redirectTo: ${window.location.origin}/login.html` ignora `basePath`. En GH Pages (`/AK-Cleaning/`) redirige a `mdqclio.github.io/login.html` → **404, reset de password roto**. | Usar `${origin}${APP_CONFIG.basePath}/login.html`. |
| `js/i18n.js:15,18` | Bug | `fetch('/i18n/${lang}.json')` ruta absoluta → 404 en GH Pages subpath (gotcha #9). Traducciones vacías, `t()` devuelve keys crudas. | Prefijo `APP_CONFIG.basePath`. |
| `invoices-api.js:76-79`, `298-301`, `orders-api.js:110-112`, `clients-api.js:96`, `checklists-api.js:237` | Bug | `auth.getUser()` desestructura `user.id` sin chequear `user` null → `TypeError` no traducido si la sesión expiró. | `if (!user) return { error:{message:'Session expired'} }`. |
| `invoices-api.js:109-120` | Lógica | `actualizarFactura`: mismo TOCTOU del lock optimista que orders. | UPDATE con `.eq('version',version)` + verificar filas. |
| `invoices-api.js:331-348` (`obtenerResumenPagos`) | Lógica | Saldo recalculado en cliente vs estado decidido por RPC `recalcular_estado_factura`. Si difiere el redondeo, UI muestra "$0.00" mientras estado sigue `parcialmente_pagada`. | Única fuente de verdad: que la RPC devuelva el resumen, o leer campos persistidos. |
| `invoices/index.html:1155-1177` (`registrarPago`) | Lógica | No valida que el pago no exceda el saldo (sobrepagos); permite pagos sobre facturas `anulada` si el estado quedó stale. | Validar `monto <= saldo`; revalidar estado actual; rechazar pagos sobre anuladas. |
| `invoices/index.html:785,1147` | Bug | `cargarPagos(factura.id, factura.total_due)`: si `total_due` es null/string, `Number(null)=0` → "Total Invoice $0.00" y saldo negativo. | `Number(factura.total_due)||0`. |
| `services-api.js:99-118` (`crearTarifa`) | Lógica | Cierra la tarifa anterior en `ayer` sin considerar el `vigente_desde` de la nueva → gap (días sin tarifa) si es futura, overlap si es retroactiva. | Cerrar en `vigente_desde - 1 día`; validar `vigente_desde` posterior; rechazar solapamientos. |
| `services-api.js:52-56`, `orders-api.js:229-237` | Lógica | `find` de tarifa vigente devuelve la PRIMERA que cumple; con solapamientos el precio es no determinista. | Ordenar `vigente_desde DESC`, tomar la más reciente; exclusión de rangos en DB. |
| `orders/index.html:808-811` | Lógica | `costo_final` se conserva aunque `estado !== 'completada'` → importes inconsistentes. | `costo_final: estado==='completada' ? (...) : null`. |
| `orders-api.js:36-55` | Lógica | Vistas `today/upcoming/past` filtran por `programada_en` con gte/lt; órdenes con `programada_en` NULL quedan invisibles sin aviso. | Definir política de NULL o marcarlas visualmente. |
| `clients/index.html:624` | Bug | `guardarContactos(cliente.id,...)` sin verificar `cliente` null (si `.single()` devolvió data null por RLS) → `TypeError`. | `if (!cliente) { toast error; return }`. |
| `properties-api.js:101-108` (`crearPropiedad`) | Bug | No setea `creado_por` (inconsistente con `actualizarPropiedad` y clientes) → registros sin autor. | Agregar lookup de usuario + `creado_por`. |
| `properties-api.js:192-201` (`eliminarEdificio`) | Race/Lógica | Chequeo `count > 0` y `delete` no atómicos; `count` null → `null > 0` es false → permite borrar si el count falló. | Confiar en FK constraint de la DB; tratar `count==null` como fallo. |
| `providers-api.js:141-153` (`toggleProveedorActivo`) | Bug | El `update` de `usuarios` no chequea error → proveedor inactivo pero login activo (estado inconsistente). | Chequear error y reflejarlo. |
| `panel/system/config.html:25` | Seguridad | Misma race de auth que health/logs (datos de CONFIG local, no DB, pero expone estructura de roles/redirects antes del gate). | Gatear arranque de Alpine tras confirmar `superadmin`. |
| `providers/index.html:561,597` | Seguridad/Lógica | El toggle `usaApp`/email queda editable en edición pero `actualizarProveedor` NO procesa esos cambios → falsa sensación de guardado; no se puede dar acceso app a un proveedor existente. | Deshabilitar en edición o implementar el update real. |

---

## 🟢 BAJOS

| Archivo:Línea | Tipo | Problema | Fix |
|---------------|------|----------|-----|
| `supabase-client.js:18` | Seguridad | `window.supabase` expone el cliente autenticado en consola en prod (facilita exfiltración / la cadena de C1). | Condicionar a dev: `if (basePath==='') window.supabase=...`. |
| `invoices/test-pdf.html` | Seguridad | Archivo de diagnóstico desplegable en prod (`/panel/invoices/test-pdf.html`) expone técnica de render + CDN externo. | Excluir del despliegue de producción. |
| `panel/system/config.html:42-43` | Seguridad | "Redactar" la anon key es seguridad de fachada (la key completa y la URL están en `config.js` público). | Aceptar que la anon key es pública por diseño + documentar; la seguridad real va en RLS. |
| `invoices/print.html:174-176` | Bug | `if (l?.precio_unitario)` oculta valores `0` legítimos (línea de $0.00 muestra `&nbsp;`). | Usar `!= null` en lugar de truthy. |
| `invoices/print.html:148-152` (`esc`) | Seguridad | `esc()` no escapa `'` ni backticks; frágil si un valor pasa a un atributo. | Escapar `'` (`&#39;`) o usar `textContent`. |
| `invoices-api.js:38-40` | Bug | Paginación: `pagina` como string desde Alpine → coerción rara; no valida `pagina>=1`. | `parseInt(pagina,10)||1`. |
| `orders/index.html:858` (`toggleChecklistItem`) | Lógica | Usa `item.completado` previo; doble-click rápido desincroniza checkbox y DB hasta el reload. | Deshabilitar item mientras hay request; derivar de `event.target.checked`. |
| `orders-api.js:161-164` | Bug | UPDATE sin `.select()` ni verificación de filas → si el id no existe / RLS bloquea, retorna éxito falso. | `.select().single()`, tratar 0 filas como error. |
| `orders-helpers.js:64-86` (`datetimeLocalToISO`) | Bug | Offset de Miami calculado sobre la fecha "fingida UTC"; en borde DST puede desviar 1h. | Resolver offset iterativamente o usar lib de timezone. |
| `clients-api.js:62-72` (`contarPropiedadesPorCliente`) | Bug | Ante error retorna `{}` silencioso → muestra 0 propiedades sin avisar del fallo. | Propagar/loguear; distinguir "0 real" de "fallo". |
| `providers/index.html:225` | Bug | `:key="chip"` en `x-for` de rubros: dos rubros iguales rompen el render; remove por `idx` puede borrar el equivocado. | `:key="idx"` o garantizar unicidad. |
| `properties/index.html:413` | Lógica | Render de dirección concatena campos sin filtrar → comas/espacios sueltos (`, FL`). | Construir con partes filtradas. |
| `reports/`, `schedule/`, `purchasing/index.html`, `payments/index.html` | Lógica | Stubs "Coming Soon" que cargan el shell completo y exponen estructura de menú/roles. `payments` permite rol `admin` mientras `invoices` solo `superadmin`/`owner` — verificar consistencia al implementar. | Aceptable como placeholder; revisar consistencia de roles. |

---

## ✅ Lo que está BIEN (para no romperlo)

- **Alpine `x-text` se usa correctamente** en la mayoría de vistas (escapa por defecto) — el XSS real se concentra en `panel-shell.js` (innerHTML) y `print.html`.
- **La anon key en `config.js` es correcta por diseño** (es pública; la protege RLS) — el problema NO es la key, es que la RLS que debería respaldarla está incompleta.
- **Las migraciones 005/006/007 documentan bien el "por qué"** de cada `SECURITY DEFINER` — el patrón es correcto, falta el guard de autorización.
- **Optimistic locking intentado** en invoices/orders (`version`) — la idea está, falta hacerlo atómico.
- **CLAUDE.md documenta exhaustivamente los gotchas** — varios bugs encontrados (i18n path, basePath) ya están descritos como patrones conocidos; solo falta aplicarlos consistentemente.

---

## 🛠️ Plan de arreglo sugerido para mañana (orden de prioridad)

### Bloque 1 — Cerrar la escalada (1-2 h, CRÍTICO)
1. **Verificar en Supabase si el signup público está habilitado.** Si lo está y no se necesita → deshabilitarlo (Auth → Settings). Esto solo mitiga C1/C2/C3 mientras se arregla el resto.
2. Agregar guard `IF NOT tiene_acceso_admin() THEN RAISE EXCEPTION` + whitelist de `p_rol` (sin `superadmin`) a **migrations 006 y 007**. Crear `migration 008`.
3. Arreglar el `ON CONFLICT` de **migration 005** (`WHERE usuarios.auth_id IS NULL`). Crear `migration 009`.
4. Quitar `window.supabase` de prod (`supabase-client.js:18`).

### Bloque 2 — Versionar y completar RLS (2-4 h, CRÍTICO/ALTO)
5. Exportar TODAS las policies actuales desde Supabase y commitearlas como `migrations/010_rls_policies.sql`.
6. Auditar que `usuarios`, `facturas`, `factura_lineas`, `empleadas`, `clientes`, `propiedades` tengan RLS que restrinja SELECT/UPDATE por rol. Confirmar que `rol` no sea modificable a `superadmin`.
7. Mover creación de cuentas (staff/users/providers) a Edge Function con `service_role`.

### Bloque 3 — Integridad de datos financieros (2-3 h, ALTO)
8. Numeración de facturas atómica (`generarNumero`) → RPC transaccional.
9. `actualizarFactura` / `crearOrden` / `actualizarOrden` / `guardarContactos` → transaccionales (delete+insert).
10. Redondeo monetario a 2 decimales + comparación de saldo con tolerancia.

### Bloque 4 — Bugs de robustez (1-2 h, MEDIO)
11. Sanear `busqueda` en todos los `.or()` (filtro PostgREST).
12. Null-checks de `auth.getUser()` en todas las APIs.
13. `obtenerDatosUsuario` → filtrar `activo=true`.
14. `recuperarPassword` y `i18n.js` → usar `basePath`.
15. Escapar HTML en `panel-shell.js`.

### Bloque 5 — Higiene (backlog)
16. SRI + versiones pineadas en CDNs.
17. Race de auth en system pages (health/logs/config).
18. Datos bancarios fuera de `config.js`.
19. Excluir `test-pdf.html` de prod.

---

## 📍 Estado de remediación (actualizado 2026-06-05)

### Bloque 1 — Cerrar la escalada ✅ CODEADO · ⏳ pendiente aplicar en DB
- `migration 008` — guards en ambos RPCs post-signup (whitelist sin superadmin · `p_auth_id=auth.uid()` o admin · fila objetivo aún en rol='empleada'). **Falta `apply_migration` en Supabase.**
- `migration 009` — `fn_handle_new_user` solo re-linkea si `auth_id IS NULL` → cierra takeover por email. **Falta aplicar.**
- `supabase-client.js` — `window.supabase` solo en dev. ✅ live al pushear.
- ⏳ **Verificar signup público ON/OFF** en Supabase Auth.

### Bloque 2 — Versionar RLS + creación server-side 🔄 EN PROGRESO
- `migration 010_export_security_snapshot.sql` — script para EXPORTAR las policies/triggers/funciones reales de la DB y versionarlas. **Correr y commitear `010_rls_policies_snapshot.sql`.** (No reconstruí a ciegas para no pisar lo que funciona.)
- `supabase/functions/admin-create-user/` — Edge Function de alta server-side (verifica caller owner/superadmin, fija rol en server, sin hijack de sesión). **Falta deployar.** Ver su README.
- `js/admin-api.js` + `config.js` flag `features.serverSideAccounts` (default **false**) — helper listo, sin cablear → prod intacto.
- ⏳ **Cutover** (paso supervisado con testeo de Leonardo): deployar función → flag true → cablear `crearUsuario/crearEmpleada/crearProveedor` a `crearCuentaAdmin()` → deshabilitar signup público → (opcional) revocar EXECUTE de los RPCs `*_post_signup`. Esto cierra el residual empleada→owner.

**Nota:** SCHEMA.md confirma que YA existen `fn_proteger_superadmin` (trigger anti-escalation), RLS `_admin_all` en todas las tablas, y `get_user_rol()` filtra `activo`. Es decir, el peor caso de la auditoría está parcialmente mitigado en la DB — pero **nada de eso está versionado**, por eso `migration 010` (exportar) es la prioridad para poder verificar realmente qué protege la base.

### Bloque 3 — Integridad de datos financieros ✅ CODEADO (cliente live · RPCs pendientes de aplicar)
Fixes de cliente **incondicionales** (live al pushear, sin dependencia de DB):
- `js/money.js` — helper de precisión monetaria (redondear/sumar/esCero).
- `invoices-api.js` — `crearFactura`/`actualizarFactura`/`generarNumero` redondean dinero y aplican el **lock de version EN el UPDATE** (cierra el TOCTOU de numeración y edición). `crearFactura` limpia la factura huérfana si fallan las líneas. `crearPago` rechaza pagos sobre borrador/anulada + redondea. `obtenerResumenPagos` redondea y expone `saldado` con tolerancia de ½ centavo. Null-guards de `getUser()`.
- `orders-api.js` — `crearOrden` borra la orden si falla un insert de hijos (no más huérfanas); `actualizarOrden` aplica lock de version en el UPDATE; null-guards.
- `clients-api.js` — `guardarContactos` chequea el error del delete antes de insertar.

Path **transaccional completo** (atomicidad real) detrás de flag:
- `migration 011` — RPCs `guardar_factura_con_lineas`, `generar_numero_factura_seguro`, `crear_orden_completa`, `actualizar_orden_completa`, `guardar_contactos_cliente` (cada operación en UNA transacción). **Falta aplicar** + verificar nombres de columnas contra SCHEMA.md.
- `config.js` flag `features.transactionalWrites` (default **false**). Activar tras aplicar 011 y testear → da atomicidad total en el delete+insert.

⏳ Pendiente DB: aplicar `migration 011`, verificar columnas, activar el flag y testear alta/edición de factura y orden.

### Bloque 4 — Bugs de robustez ✅ HECHO (todo cliente, live)
- `js/safe-filter.js` — `sanitizarBusqueda()` neutraliza `,()\\` (inyección de filtro PostgREST). Cableado en los 9 módulos con `.or()`/`.ilike()` de búsqueda (invoices, orders, clients, properties, providers, staff, users, services, checklists).
- Null-guards de `getUser()` agregados donde faltaban (clients crear/actualizar, properties actualizar; invoices/orders ya en Bloque 3; checklists ya tenía).
- `auth.js` — `obtenerDatosUsuario` filtra `activo=true` → usuario desactivado pierde acceso al re-chequear sesión.
- `auth.js` — `recuperarPassword` usa `basePath` en `redirectTo` (reset roto en GH Pages).
- `i18n.js` — `fetch` usa `basePath` (traducciones 404 en GH Pages).
- `panel-shell.js` — `escHtml()` escapa nombre/apellido/rol antes de `innerHTML` → cierra XSS almacenado del shell.

Sintaxis verificada con `node --check` (13 archivos).

### Bloque 5 — Higiene 🔄 CASI COMPLETO (1 ítem necesita decisión)
- **Race de auth** en `system/health.html`, `logs.html`, `config.html`: Alpine ahora se importa SOLO después de que `iniciarPanel` confirma rol `superadmin` (`if (!usuario) return`). El `x-init`/`init()` ya no consulta la DB antes del gate. ✅
- **CDNs pineados** (cierra el supply-chain de `@latest` flotante): `lucide@latest` → `lucide@1.17.0` exacto + **SRI** `sha384` + `crossorigin` (10 archivos); `alpinejs@3.x.x` → `alpinejs@3.14.8` (13 archivos). Sin residual flotante. ✅
- **`test-pdf.html`** eliminado de prod. ✅
- ⏳ **Supabase JS** (`@supabase/supabase-js@2` vía skypack ESM): se dejó como está. SRI no aplica a imports ESM dinámicos; bumpear la versión exacta es riesgo funcional. Recomendado a futuro: autoalojar o pinear versión exacta y testear.
- ⏳ **#18 Datos bancarios en `config.js` (NECESITA DECISIÓN)**: routing/account/SWIFT siguen en el JS público. No se movieron porque requiere decisión + cambio de DB. **Opción recomendada**: tabla `config_empresa` (o `datos_pago`) con RLS que solo permita SELECT a `owner`/`superadmin`, y `print.html` lee de ahí en vez de `config.js`. Alternativa: aceptar que van impresos en la factura igual y documentarlo. Pendiente de tu decisión para implementar.

---

### Bloque 6 — Errores de lógica de negocio ✅ HECHO (cliente, live)
ALTO + MEDIOS + BAJOs de correctitud (no-seguridad) que no entraban en B1-B5:
- `orders-api.js listarOrdenes` — filtro `asignado` resuelto a `os_id` ANTES de paginar (`.in('id', …)`) → count y páginas correctos (era el ALTO).
- `services-api.js` + `orders-api.js` — tarifa vigente: se toma la de `vigente_desde` más reciente ante solapamiento (determinista).
- `services-api.js crearTarifa` — cierra la tarifa anterior en `vigente_desde - 1 día` (UTC), no en "ayer" → sin gap/overlap.
- `orders-api.js` — vista `upcoming` incluye órdenes sin agendar (`programada_en` NULL); `listarStaffActivos` ordena con `nullsFirst:false`.
- `properties-api.js` — `crearPropiedad` setea `creado_por` + null-guard; `eliminarEdificio` trata `count==null`/error como bloqueo (no borra).
- `providers-api.js` — `toggleProveedorActivo` chequea el error del update a `usuarios`; reset links usan `basePath` (leftover de B4).
- `clients-api.js` — `contarPropiedadesPorCliente` loguea el error en vez de tragárselo.
- `invoices-api.js listarFacturas` — `pagina` con `parseInt`/`max(1,…)`.
- `invoices/index.html` — `cargarPagos` coerce `total_due` null→0; `providers/index.html` — `:key="idx"` en chips de rubros (evita render roto por duplicados).

**Dejados a propósito (necesitan decisión, no son bugs claros):**
- `orders costo_final` cuando estado ≠ completada: forzar null descartaría lo que el usuario tipeó → decisión de UX.
- Cabecera de factura con tax/descuento siempre 0: probablemente intencional (V1 = sin impuestos, CLAUDE.md).
- `providers` toggle "app access" editable en edición sin efecto: es un feature gap (falta soportar alta de cuenta en update), no un bug de datos.
- BAJOs cosméticos: `print.html` oculta $0 / `esc()` sin `'`; `toggleChecklistItem` stale; DST en `datetimeLocalToISO`; concat de dirección. Bajo impacto.

---

## Notas finales

- **No se pudo auditar la RLS real** porque no está en el repo. Toda evaluación de severidad de seguridad asume el peor caso (RLS ausente o permisiva). Si las policies en Supabase ya son estrictas, varios CRÍTICOS bajan a MEDIO — **pero eso no se puede verificar sin exportarlas.** Prioridad #1: versionarlas.
- Esta auditoría es estática (lectura de código). No se ejecutó la app ni se probaron exploits reales contra la base. La cadena de C1 está validada lógicamente, no ejecutada.
- Para mañana, recomiendo empezar por el **Bloque 1** — es lo que convierte "cualquiera es superadmin" en "el sistema es defendible".
