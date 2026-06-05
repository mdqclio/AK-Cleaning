# Pendientes de la Auditoría — AK Property Management

Resumen accionable tras la auditoría (detalle por hallazgo en `docs/auditoria.md`).
Última actualización: 2026-06-05 · Commits `5de5c95`→`6bbc86c` en `main`.

## Estado por bloque

| Bloque | Estado |
|--------|--------|
| 1 Escalada de privilegios | ✅ (queda solo: apagar Sign Ups tras el cutover) |
| 2 RLS + creación server-side | ✅ Edge Function deployada + flag ON · falta test browser + Sign Ups OFF |
| 3 Integridad financiera | ✅ cerrado (testeado) |
| 4 Robustez | ✅ |
| 5 Higiene | ✅ |
| 6 Lógica de negocio | ✅ |
| Advisor Supabase (nuevos) | ✅ (queda: leaked-password ON, dashboard) |
| Cosmético 15-18 | ✅ |
| Decisiones 10-14 | 10 ✅ · 13 ✅ · 11/12/14 abiertas |

**Nota de contexto:** el proyecto vive en VPS Hetzner → GitHub. Nada en producción aún, sin uso real. Claude trabaja directo en el VPS (commit+push). El Mac no se usa.

---

## ✅ HECHO (vía MCP Supabase + código, esta tanda)

- **008** — guards en RPCs post-signup (anti escalada).
- **009** — anti account-takeover por colisión de email.
- **010** — snapshot real de seguridad → `migrations/010_rls_policies_snapshot.sql` (30 tablas RLS ON, 58 policies, funciones, triggers). Checklist verificado.
- **011** — RPCs transaccionales. Bug `crear_orden_completa` (NULL en columnas DEFAULT NOT NULL) encontrado y corregido.
- **Item 9** — `transactionalWrites=true`, testeado OK en browser.
- **012** — hardening advisor: `SET search_path` en 7 funcs + `REVOKE EXECUTE` en 8 trigger funcs.
- **013** — bucket `facturas` privado + signed URLs (**fuga crítica de PDFs** cerrada: era público con paths secuenciales `{año}/{numero}.pdf` → descarga enumerada sin auth).
- **014** — tabla `config_empresa` + página **Business Info** (decisión 10): datos de empresa/pago configurables desde UI, fuera del `config.js` público.
- **Cosmético 15-18** corregido.
- **Edge Function `admin-create-user` DEPLOYADA** (v1, ACTIVE, verify_jwt=true) + `crear*` cableadas + `serverSideAccounts=true`.
- **Decisión 13** — toggle "app access" en edición de provider ahora crea la cuenta.

---

## ⬅️ QUEDA — solo tuyo (browser / dashboard)

1. **Test de alta de cuentas** (VPS, con un owner logueado): crear usuario / empleada / proveedor con app access. Debe crear la cuenta sin desloguearte y mostrar el link de invitación.
   - ⚠️ `usuarios` tiene 0 filas — quizá primero haya que crear el primer owner/superadmin por SQL para poder loguearte.
2. **Sign Ups OFF** (tras test OK): Auth → Providers → Email → "Allow new users to sign up" = off. Cierra el residual empleada→owner.
3. **Leaked-password protection ON**: Auth → Password (HaveIBeenPwned), 1 click.
4. **Test visual** del trabajo de esta tanda: factura (`print.html` $0 + datos de Business Info), checklist doble-click, Business Info save.

Opcional (lo hace Claude por MCP cuando confirmes el test): revocar `EXECUTE` de los RPCs `*_post_signup` a `authenticated` (quedan obsoletos con la Edge Function).

---

## 🤔 Decisiones abiertas

- **11 — `orders.costo_final` cuando estado ≠ completada.** Hoy NO se fuerza a null (se conserva lo tipeado). ¿Está bien así, o querés limpiarlo al cambiar de estado? → decisión UX, sin código por ahora.
- **12 — Factura: tax/descuento siempre 0 en cabecera.** Asumido intencional (V1 sin impuestos). → confirmá y se cierra.
- **14 — `supabase-js@2` sin pin/SRI.** Diferido: pinear a versión exacta o autoalojar **requiere testear en browser** (toda la app depende de ese import). Hacerlo cuando haya entorno de test.

---

## Decisiones ya resueltas
- **10 — Datos de empresa/pago:** ✅ tabla `config_empresa` + página Business Info (Setup, owner/superadmin). `config.js` limpio.
- **13 — Toggle app access provider en edición:** ✅ implementado (crea+linkea cuenta).
