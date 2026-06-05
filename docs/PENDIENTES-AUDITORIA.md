# Pendientes de la Auditoría — AK Property Management

Resumen accionable de lo que FALTA tras la auditoría (ver `docs/auditoria.md` para el detalle de cada hallazgo).
Última actualización: 2026-06-05 · Commits `5de5c95`→`3df33a4` en `main`.

## Estado: qué ya está live vs qué falta

| Bloque | Live en prod | Falta |
|--------|:---:|---|
| 1 Escalada de privilegios | ✅ migraciones 008/009 aplicadas | solo decisión Sign Ups (item 1) |
| 2 RLS + creación server-side | ✅ snapshot 010 exportado/verificado | deploy Edge Function, cutover (6-7) |
| 3 Integridad financiera | ✅ 011 aplicado + flag ON, testeado | — nada |
| 4 Robustez | ✅ | — nada |
| 5 Higiene | ✅ | decisión datos bancarios |
| 6 Lógica de negocio | ✅ | 4 ítems con decisión |

Todo lo marcado ✅ ya protege/funciona. **Lo bloqueante restante es CLI/dashboard** (Edge Function + Auth settings).

## ✅ HECHO en esta tanda (vía MCP Supabase + test Leonardo)
- **008** aplicado — guards en RPCs post-signup (anti escalada).
- **009** aplicado — anti account-takeover por colisión de email.
- **010** exportado y verificado → `migrations/010_rls_policies_snapshot.sql` (30 tablas RLS ON, 58 policies, funciones, triggers).
- **011** aplicado — RPCs transaccionales. Bug encontrado y corregido: `crear_orden_completa` insertaba NULL en columnas con DEFAULT NOT NULL (`id/numero/version/estado`).
- **Item 9**: `features.transactionalWrites=true` activado y testeado OK en browser (5 escrituras: crear/editar orden, crear factura, generar número, editar contactos cliente).
- **012** aplicado — hardening advisor: `SET search_path` en 7 funcs + `REVOKE EXECUTE` en 8 trigger funcs.
- **013** aplicado — bucket `facturas` privado + signed URLs (fuga crítica de PDFs cerrada).
- **Cosmético 15-18** corregido (`d9ce910`).
- **Cutover wiring (item 7)** — `crear*` cableadas a la Edge Function detrás del flag (`67b6e20`). Falta deploy + activar flag + test.

---

## 🔴 BLOQUEANTE
1. **Verificar signup público**: Auth → Providers → Email → ¿"Sign Ups" ON? Dejarlo ON (lo usa el alta actual) hasta el cutover de Bloque 2. → decisión tuya.
2. ✅ **008 aplicado** — guards en RPCs post-signup.
3. ✅ **009 aplicado** — cierra el account-takeover por colisión de email.

## 🟠 Bloque 2 — Versionar RLS + creación server-side

4. ✅ **010 exportado** → `migrations/010_rls_policies_snapshot.sql` commiteado.
5. ✅ **Checklist verificado**: `usuarios`/`facturas`/`factura_lineas` RLS estricta OK; `fn_proteger_superadmin` + RLS bloquean self-promotion a superadmin (residual empleada→owner vía RPC cierra recién con cutover); IDOR de `print.html` cerrado (facturas SELECT solo admin).
6. **Deploy de la Edge Function** ⬅️ TUYO (CLI): `supabase functions deploy admin-create-user --project-ref ccdpbiflbewhnidigiin` (ver `supabase/functions/admin-create-user/README.md`).
7. **Cutover de creación de cuentas** (supervisado, con testeo de Leonardo):
   - ✅ cableado `crearUsuario`/`crearEmpleada`/`crearProveedor` → `crearCuentaAdmin()` (commit `67b6e20`, detrás del flag).
   - ⬅️ TUYO: tras el deploy (6), poner `config.js: features.serverSideAccounts = true` y probar alta de cada rol (admin/empleada/proveedor/compras) en browser.
   - ⬅️ TUYO: si OK, **deshabilitar Sign Ups públicos** (Auth → Email) → cierra el residual empleada→owner.
   - opcional (lo hago yo por MCP cuando confirmes): revocar `EXECUTE` de los RPCs `*_post_signup` a `authenticated`.

## 🟠 Bloque 3 — Atomicidad financiera ✅ CERRADO
8. ✅ **011 aplicado** (columnas verificadas vs DB real; bug `crear_orden_completa` corregido).
9. ✅ **`transactionalWrites=true`** activado y testeado OK.

## ➕ Hallazgos NUEVOS del advisor de Supabase (no estaban en la auditoría original)
- ✅ **`function_search_path_mutable`** — 7 funcs pineadas con `SET search_path` (012).
- ✅ **Trigger funcs ejecutables como RPC** — `REVOKE EXECUTE` a anon/authenticated en 8 funcs (012). Helpers RLS/counters/`*_post_signup` se dejan a propósito.
- ✅ **Bucket `facturas`** — era público con paths secuenciales (`{año}/{numero}.pdf`) → descarga enumerada de toda la facturación sin auth. Cerrado (013): bucket privado, 10MB, solo PDF, SELECT admin-only, `subirPDF` guarda path + `urlFirmadaPDF` (signed URLs). **El más serio de toda la auditoría.**
- ⬅️ TUYO: **`auth_leaked_password_protection` OFF** → activar en Auth → Password (HaveIBeenPwned), 1 click.

## 🟢 Backlog cosmético ✅ CERRADO (15-18)
- 15 print.html: `esc()` escapa `'`; precio/total muestran $0 (`!= null`).
- 16 orders `toggleChecklistItem`: guard re-entrante + update optimista.
- 17 `datetimeLocalToISO`: re-muestrea offset → corrige borde DST.
- 18 properties `formatearDireccion`: incluye `direccion_2` (ya sin comas sueltas).

---

## 🤔 Decisiones tuyas (no son bugs claros)

10. **Datos bancarios en `config.js` público** (routing/account/SWIFT). Recomendado: tabla `config_empresa`/`datos_pago` con RLS solo `owner`/`superadmin`, y `print.html` lee de ahí. Alternativa: aceptar (van impresos en la factura igual). → **¿Implementar la tabla?**
11. **`orders` `costo_final` cuando estado ≠ completada**: forzar null borraría lo que el usuario tipeó. → decisión UX.
12. **Factura: tax/descuento siempre 0 en cabecera**: probablemente intencional (V1 sin impuestos). → confirmar.
13. **Providers: toggle "app access" editable en edición sin efecto**: feature gap (falta soportar alta de cuenta en `actualizarProveedor`). → ¿implementar o deshabilitar el toggle en edición?
14. **`supabase-js@2` sin pin/SRI**: ESM dinámico no soporta SRI. A futuro: autoalojar o pinear versión exacta y testear.

(Cosmético 15-18 ✅ cerrado — ver sección de advisors arriba.)

---

## Qué queda
**Solo tuyo (CLI/dashboard):**
1. Deploy Edge Function `admin-create-user` (item 6).
2. Tras deploy: `serverSideAccounts=true` + test alta de cada rol → Sign Ups OFF (item 7 + item 1).
3. Activar leaked-password protection (Auth → Password).

**Decisiones (10-14)** cuando quieras — varias las puede implementar Claude:
- 10 datos bancarios → tabla `datos_pago` con RLS (Claude lo hace si decidís).
- 13 toggle "app access" en edición de provider → implementar o deshabilitar.
- 11 costo_final UX · 12 confirmar tax V1=0 · 14 pin supabase-js (a futuro).
