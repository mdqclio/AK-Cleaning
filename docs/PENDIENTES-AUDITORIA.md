# Pendientes de la Auditoría — AK Property Management

Resumen accionable de lo que FALTA tras la auditoría (ver `docs/auditoria.md` para el detalle de cada hallazgo).
Última actualización: 2026-06-05 · Commits `5de5c95`→`1b8105f` en `main`.

## Estado: qué ya está live vs qué falta

| Bloque | Live en prod | Falta |
|--------|:---:|---|
| 1 Escalada de privilegios | código commiteado | **aplicar migraciones en Supabase** |
| 2 RLS + creación server-side | fundaciones | correr export, deploy Edge Function, cutover |
| 3 Integridad financiera | ✅ cliente | aplicar RPCs transaccionales + activar flag |
| 4 Robustez | ✅ | — nada |
| 5 Higiene | ✅ | decisión datos bancarios |
| 6 Lógica de negocio | ✅ | 4 ítems con decisión |

Todo lo marcado ✅ ya protege/funciona. **Lo bloqueante es trabajo en Supabase** (no se puede hacer desde el repo).

---

## 🔴 BLOQUEANTE — aplicar en Supabase (hacer primero)

> Hasta aplicar esto, la escalada de privilegios sigue ABIERTA en la base. El código está listo; las funciones viven en Supabase.

1. **Verificar signup público**: Auth → Providers → Email → ¿"Sign Ups" ON? Si está ON y no se necesita público, evaluar dejarlo (lo usa el alta actual desde el cliente) hasta el cutover de Bloque 2.
2. **Aplicar `migrations/008_hardening_rpc_post_signup.sql`** — guards en los RPCs post-signup (whitelist sin superadmin, `auth.uid()`, fila aún en rol='empleada').
3. **Aplicar `migrations/009_fix_trigger_on_conflict_takeover.sql`** — cierra el account-takeover por colisión de email.
   - Depende de que exista `tiene_acceso_admin()` (confirmado en SCHEMA.md:267).

## 🟠 Bloque 2 — Versionar RLS + creación server-side

4. **Correr `migrations/010_export_security_snapshot.sql`** (es un script de EXPORT, no de apply). Guardar la salida como `migrations/010_rls_policies_snapshot.sql` y commitearla.
5. **Verificar el checklist** dentro de 010: que `usuarios`/`facturas`/`factura_lineas`/`empleadas` tengan RLS estricta; que `fn_proteger_superadmin` bloquee self-promotion; que RLS de `facturas` cierre el IDOR de `print.html`.
6. **Deploy de la Edge Function**: `supabase functions deploy admin-create-user --project-ref ccdpbiflbewhnidigiin` (ver `supabase/functions/admin-create-user/README.md`).
7. **Cutover de creación de cuentas** (supervisado, con testeo de Leonardo):
   - `config.js`: `features.serverSideAccounts = true`
   - cablear `crearUsuario`/`crearEmpleada`/`crearProveedor` a `crearCuentaAdmin()` (`js/admin-api.js`)
   - probar alta de cada rol
   - **deshabilitar Sign Ups públicos** en Supabase → cierra el residual empleada→owner
   - opcional: revocar `EXECUTE` de los RPCs `*_post_signup` a `authenticated`

## 🟠 Bloque 3 — Atomicidad financiera (RPCs transaccionales)

8. **Aplicar `migrations/011_rpc_escrituras_transaccionales.sql`** — **verificar primero los nombres de columnas** contra SCHEMA.md (especialmente `cliente_contactos` y `ordenes_servicio`; se escribieron desde la doc, no desde la DB real).
9. **Activar `config.js`: `features.transactionalWrites = true`** y testear alta/edición de factura y orden.
   - Sin esto, el path legacy ya tiene los locks de version y el redondeo (cliente live); solo falta la atomicidad total del delete+insert.

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

## Orden sugerido para mañana
1. Bloque 1 (ítems 1-3) — cierra la escalada. ~30 min.
2. Bloque 2 export + verificar RLS (ítems 4-5) — saber qué protege realmente la DB. ~1 h.
3. Bloque 3 (ítems 8-9) — atomicidad financiera. ~30 min + testeo.
4. Bloque 2 cutover (ítems 6-7) — cuando haya tiempo de testear bien.
5. Decisiones (10-14) cuando quieras.
