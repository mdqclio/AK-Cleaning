# Pendientes de la Auditoría — AK Property Management

Detalle por hallazgo en `docs/auditoria.md`.
Última actualización: 2026-06-05 · Commits `5de5c95`→`da2f83c` en `main`.

> **Estado: auditoría CERRADA.** Decisiones 10-14 todas resueltas. Queda solo
> 1 toggle de dashboard (leaked-password) + validación visual en browser.
> Contexto: VPS Hetzner → GitHub. Nada en producción aún.

## Estado por bloque

| Bloque | Estado |
|--------|--------|
| 1 Escalada de privilegios | ✅ cerrado (signup OFF + Edge Function + RPCs revocados) |
| 2 RLS + creación server-side | ✅ cerrado (snapshot 010, Edge Function deployada, cutover ON) |
| 3 Integridad financiera | ✅ cerrado (testeado) |
| 4 Robustez | ✅ |
| 5 Higiene | ✅ |
| 6 Lógica de negocio | ✅ |
| Advisor Supabase | ✅ (queda solo leaked-password, dashboard) |
| Cosmético 15-18 | ✅ |
| Decisiones | 10/11/12/13/14 ✅ todas resueltas |

---

## ⬜ Lo único que queda

**Dashboard (1 click):**
- Activar **Leaked password protection** (Auth → Password, HaveIBeenPwned).

**Validación en browser (cuando puedas):**
- Probar alta de cuenta (usuario / empleada / proveedor con app access) → confirmar que la Edge Function `admin-create-user` anda end-to-end.
- Revisar visualmente: factura (`print.html` con datos de Business Info + $0), Business Info save, checklist doble-click.

**Decisiones de producto:** ✅ todas resueltas (10-14).

_Histórico de decisiones:_
_(decisiones 11/12/14 resueltas — ver abajo)_

✅ **11 resuelta (2026-06-05): queda como está** — `costo_final` conserva lo tipeado aunque la orden no esté completada. Sin cambio de código.
✅ **12 confirmada (2026-06-05): V1 sin impuestos.** tax/descuento = 0 fijo en cabecera, intencional. Sin cambio de código.
✅ **14 resuelta (2026-06-05): se deja `supabase-js@2`** — sin pin por ahora. Riesgo bajo; reevaluar si aparece un problema.

---

## ✅ Resuelto (migraciones 008→015 + código)

- **008/009** — guards RPCs post-signup + anti account-takeover por email.
- **010** — snapshot real de RLS/funciones/triggers versionado y verificado.
- **011** — RPCs transaccionales (bug `crear_orden_completa` corregido). Flag `transactionalWrites` ON, testeado.
- **012** — `SET search_path` en 7 funcs + `REVOKE EXECUTE` en 8 trigger funcs.
- **013** — bucket `facturas` privado + signed URLs (**fuga crítica de PDFs** cerrada).
- **014** — tabla `config_empresa` + página **Business Info** (decisión 10): datos de empresa/pago configurables desde UI; `config.js` limpio.
- **015** — `REVOKE EXECUTE` de `*_post_signup` (obsoletos con la Edge Function).
- **Edge Function `admin-create-user`** deployada (v1, ACTIVE, verify_jwt) + `crear*` cableadas + `serverSideAccounts` ON.
- **Sign Ups públicos OFF** (hecho en dashboard).
- **Cosmético 15-18** corregido.
- **Decisión 13** — toggle app access en edición de provider ahora crea la cuenta.
- **Bootstrap de acceso** — perfiles superadmin (clio@mdq.com.ar) + owner (andy.flo@hotmail.com) creados; `leito` (signup público) eliminado.

### Residual empleada→owner: muerto por 3 capas
1. Sign Ups públicos OFF (no se crean cuentas desde afuera).
2. Alta de cuentas vía Edge Function (rol fijado server-side, verifica owner/superadmin).
3. `EXECUTE` de los RPCs `*_post_signup` revocado a anon/authenticated.

## Bonus (fuera de auditoría)
- `panel/system/config.html` estaba en blanco (shell incorrecto + import roto) → arreglado.
