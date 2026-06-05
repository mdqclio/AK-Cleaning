-- Migration 010: SNAPSHOT de seguridad — versionar RLS, triggers y funciones
-- Fecha: 2026-06-05  ·  Bloque 2 de docs/auditoria.md (items 5 y 6)
--
-- ⚠️ ESTO NO ES UNA MIGRACIÓN QUE SE APLICA. Es un SCRIPT DE EXPORTACIÓN.
--
-- PROBLEMA (hallazgo arquitectónico de la auditoría):
-- Ninguna RLS policy ni el trigger anti-escalation (fn_proteger_superadmin) está
-- versionado en el repo. Se aplicaron a mano en el dashboard de Supabase. No se
-- pueden auditar, reproducir ni revisar. NO se deben reconstruir "a ojo" porque
-- se correría el riesgo de pisar las policies que hoy funcionan.
--
-- SOLUCIÓN CORRECTA: exportar las definiciones REALES desde la base (fuente de
-- verdad) y commitearlas. Este archivo contiene las queries para hacerlo.
--
-- CÓMO USARLO
-- ──────────
-- A) Con Supabase CLI / psql:
--      psql "$DATABASE_URL" -At -f migrations/010_export_security_snapshot.sql \
--        > migrations/010_rls_policies_snapshot.sql
--    (revisar el archivo generado y commitearlo)
--
-- B) Desde el SQL Editor del dashboard: correr cada bloque y copiar el resultado
--    a migrations/010_rls_policies_snapshot.sql.
--
-- C) Con MCP Supabase (Codespaces): execute_sql con cada query y guardar la salida.
--
-- Después de exportar, VERIFICAR contra lo que la auditoría espera (ver checklist
-- al final de este archivo).

-- ══════════════════════════════════════════════════════════════════════════
-- 1. RLS habilitado por tabla (debe estar ON en todas las tablas de negocio)
-- ══════════════════════════════════════════════════════════════════════════
SELECT format(
  'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;',
  schemaname, tablename
) AS ddl
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = true
ORDER BY tablename;

-- Tablas SIN RLS en public (revisar: ¿deberían tenerlo? p.ej. factura_counter
-- está bien sin policies porque solo lo tocan funciones SECURITY DEFINER):
SELECT format('-- SIN RLS: %I.%I', schemaname, tablename) AS warn
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false
ORDER BY tablename;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Todas las RLS policies de public (CREATE POLICY reconstruidas reales)
-- ══════════════════════════════════════════════════════════════════════════
SELECT format(
  'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
  policyname, schemaname, tablename,
  CASE WHEN permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
  cmd,
  array_to_string(roles, ', '),
  CASE WHEN qual IS NOT NULL THEN E'\n  USING (' || qual || ')' ELSE '' END,
  CASE WHEN with_check IS NOT NULL THEN E'\n  WITH CHECK (' || with_check || ')' ELSE '' END
) AS ddl
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Definición completa de las funciones de seguridad y triggers
-- ══════════════════════════════════════════════════════════════════════════
SELECT pg_get_functiondef(p.oid) || ';' AS ddl
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_user_rol', 'get_usuario_id', 'tiene_acceso_admin', 'es_superadmin',
    'es_asignado_os', 'fn_proteger_superadmin', 'fn_handle_new_user',
    'fn_proteger_factura_emitida', 'fn_audit_log', 'fn_incrementar_version',
    'siguiente_numero_factura', 'devolver_numero_factura',
    'recalcular_estado_factura',
    'actualizar_perfil_post_signup', 'crear_empleada_post_signup'
  )
ORDER BY p.proname;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. Triggers (enganches)
-- ══════════════════════════════════════════════════════════════════════════
SELECT pg_get_triggerdef(t.oid) || ';' AS ddl
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname IN ('public', 'auth')
ORDER BY c.relname, t.tgname;

-- ══════════════════════════════════════════════════════════════════════════
-- CHECKLIST DE VERIFICACIÓN (auditoría — hacer tras exportar)
-- ══════════════════════════════════════════════════════════════════════════
-- [ ] `usuarios` tiene RLS ON.
-- [ ] Existe policy que IMPIDE a no-superadmin hacer UPDATE de `rol` a 'superadmin'
--     (o el trigger fn_proteger_superadmin lo bloquea). Confirmar el cuerpo real
--     de fn_proteger_superadmin — debe bloquear:
--       · cambiar rol de/ hacia 'superadmin' por quien no es superadmin
--       · que un usuario cambie su PROPIO rol hacia arriba (self-promotion)
-- [ ] `facturas`, `factura_lineas`, `factura_pagos` tienen RLS que restringe
--     SELECT a roles autorizados (hallazgo IDOR en print.html depende de esto).
-- [ ] `empleadas`: `tarifa_hora` no se devuelve a roles sin permiso (hallazgo
--     puedeVerDinero). Si la policy es _admin_all amplia, considerar columna o
--     vista restringida.
-- [ ] Owner NO ve filas superadmin en `usuarios` (policy documentada).
-- [ ] Tablas con SELECT abierto a `authenticated` sin filtro por rol: listar y
--     decidir si es correcto.
--
-- Guardar la salida en migrations/010_rls_policies_snapshot.sql y commitearla.
