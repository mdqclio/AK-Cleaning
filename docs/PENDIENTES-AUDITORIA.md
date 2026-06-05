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

---

## 🔴 BLOQUEANTE
1. **Verificar signup público**: Auth → Providers → Email → ¿"Sign Ups" ON? Dejarlo ON (lo usa el alta actual) hasta el cutover de Bloque 2. → decisión tuya.
2. ✅ **008 aplicado** — guards en RPCs post-signup.
3. ✅ **009 aplicado** — cierra el account-takeover por colisión de email.

## 🟠 Bloque 2 — Versionar RLS + creación server-side

4. ✅ **010 exportado** → `migrations/010_rls_policies_snapshot.sql` commiteado.
5. ✅ **Checklist verificado**: `usuarios`/`facturas`/`factura_lineas` RLS estricta OK; `fn_proteger_superadmin` + RLS bloquean self-promotion a superadmin (residual empleada→owner vía RPC cierra recién con cutover); IDOR de `print.html` cerrado (facturas SELECT solo admin).
6. **Deploy de la Edge Function**: `supabase functions deploy admin-create-user --project-ref ccdpbiflbewhnidigiin` (ver `supabase/functions/admin-create-user/README.md`).
7. **Cutover de creación de cuentas** (supervisado, con testeo de Leonardo):
   - `config.js`: `features.serverSideAccounts = true`
   - cablear `crearUsuario`/`crearEmpleada`/`crearProveedor` a `crearCuentaAdmin()` (`js/admin-api.js`)
   - probar alta de cada rol
   - **deshabilitar Sign Ups públicos** en Supabase → cierra el residual empleada→owner
   - opcional: revocar `EXECUTE` de los RPCs `*_post_signup` a `authenticated`

## 🟠 Bloque 3 — Atomicidad financiera ✅ CERRADO
8. ✅ **011 aplicado** (columnas verificadas vs DB real; bug `crear_orden_completa` corregido).
9. ✅ **`transactionalWrites=true`** activado y testeado OK.

## ➕ Hallazgos NUEVOS del advisor de Supabase (no estaban en la auditoría original)
- **`function_search_path_mutable`** en `fn_proteger_superadmin` y `fn_audit_log` (ambas SECURITY DEFINER, sin `SET search_path`) + 4 trigger funcs. Riesgo search_path injection (gotcha #11). → fix DB, hago yo por MCP.
- **Trigger functions ejecutables como RPC** (`fn_audit_log`, `fn_handle_new_user`, `fn_proteger_superadmin`, etc.) → conviene `REVOKE EXECUTE` a anon/authenticated.
- **`auth_leaked_password_protection` OFF** → activar en Auth → Password (HaveIBeenPwned). Dashboard, tuyo.
- **Bucket `facturas` público con SELECT amplio** → permite listar todos los archivos. Revisar policy de storage.

---

## 🤔 Decisiones tuyas (no son bugs claros)

10. **Datos bancarios en `config.js` público** (routing/account/SWIFT). Recomendado: tabla `config_empresa`/`datos_pago` con RLS solo `owner`/`superadmin`, y `print.html` lee de ahí. Alternativa: aceptar (van impresos en la factura igual). → **¿Implementar la tabla?**
11. **`orders` `costo_final` cuando estado ≠ completada**: forzar null borraría lo que el usuario tipeó. → decisión UX.
12. **Factura: tax/descuento siempre 0 en cabecera**: probablemente intencional (V1 sin impuestos). → confirmar.
13. **Providers: toggle "app access" editable en edición sin efecto**: feature gap (falta soportar alta de cuenta en `actualizarProveedor`). → ¿implementar o deshabilitar el toggle en edición?
14. **`supabase-js@2` sin pin/SRI**: ESM dinámico no soporta SRI. A futuro: autoalojar o pinear versión exacta y testear.

## 🟢 Backlog cosmético (bajo impacto)

15. `print.html`: oculta valores $0 legítimos (`if (l?.precio)` en vez de `!= null`); `esc()` no escapa `'`.
16. `orders` `toggleChecklistItem`: usa estado previo → posible desync en doble-click.
17. `orders-helpers` `datetimeLocalToISO`: offset puede desfasar 1h en borde DST.
18. `properties/index.html`: concat de dirección deja comas sueltas si faltan campos.

---

## Qué queda (orden sugerido)
1. ✅ ~~Bloque 1 (1-3)~~ · ✅ ~~Bloque 2 export (4-5)~~ · ✅ ~~Bloque 3 (8-9)~~
2. Fix advisor DB (search_path + revokes) — lo hace Claude por MCP. + activar leaked-password (dashboard).
3. Bloque 2 cutover (6-7) — deploy Edge Function + cablear `crear*` a `crearCuentaAdmin()` + Sign Ups OFF. Cuando haya tiempo de testear bien.
4. Decisiones (10-14) cuando quieras.
