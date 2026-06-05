-- Migration 012: Hardening de hallazgos del advisor de Supabase
-- Fecha: 2026-06-05
--
-- CONTEXTO: get_advisors (security) reportó tras aplicar 008/009/011:
--   A) function_search_path_mutable: trigger funcs SECURITY DEFINER sin
--      `SET search_path` → vulnerables a search_path injection (gotcha #11).
--   B) anon/authenticated pueden ejecutar como RPC funciones que son SOLO de
--      trigger (fn_audit_log, fn_proteger_superadmin, etc.) y el event-trigger
--      rls_auto_enable. No deben ser invocables vía PostgREST.
--
-- NO se tocan:
--   · Helpers RLS (get_user_rol, get_usuario_id, tiene_acceso_admin, es_superadmin,
--     es_asignado_os): `authenticated` los necesita para evaluar las policies.
--   · Counters/RPCs legítimos (siguiente_numero_factura, generar_numero_factura_seguro,
--     *_post_signup): siguen siendo invocables (el cutover de Bloque 2 revoca los
--     *_post_signup cuando corresponda).
--
-- Las trigger functions disparan en el contexto del owner de la tabla, no
-- requieren EXECUTE del caller → revocar a PUBLIC NO rompe los triggers.

-- ── A) Pin de search_path en trigger/event-trigger functions ────────────────
ALTER FUNCTION public.fn_proteger_superadmin()        SET search_path = public;
ALTER FUNCTION public.fn_audit_log()                  SET search_path = public;
ALTER FUNCTION public.fn_actualizado_en()             SET search_path = public;
ALTER FUNCTION public.fn_incrementar_version()        SET search_path = public;
ALTER FUNCTION public.fn_proteger_reporte_inmutable() SET search_path = public;
ALTER FUNCTION public.fn_proteger_factura_emitida()   SET search_path = public;
ALTER FUNCTION public.rls_auto_enable()               SET search_path = public;

-- ── B) Revocar EXECUTE de funciones que son SOLO de trigger ─────────────────
-- Supabase otorga EXECUTE DIRECTO a anon/authenticated (default privileges), no
-- solo vía PUBLIC → hay que revocar a esos roles explícitamente. service_role
-- conserva el grant. Los triggers disparan en contexto del owner → no rompen.
REVOKE EXECUTE ON FUNCTION public.fn_proteger_superadmin()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_log()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_actualizado_en()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_incrementar_version()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_proteger_reporte_inmutable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_proteger_factura_emitida()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_handle_new_user()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()               FROM PUBLIC, anon, authenticated;

-- NOTA: se DEJAN ejecutables a propósito (warnings aceptados del advisor):
--   · helpers RLS (get_user_rol, get_usuario_id, tiene_acceso_admin,
--     es_superadmin, es_asignado_os): authenticated los necesita para policies.
--   · counters/recalc (siguiente/devolver_numero_factura, recalcular_estado_factura,
--     generar_numero_factura_seguro): los invoca el cliente vía RPC.
--   · *_post_signup: se revocan en el cutover de Bloque 2.
