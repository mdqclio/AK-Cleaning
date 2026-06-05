-- Migration 008: Hardening de los RPCs post-signup (Bloque 1 de auditoría)
-- Fecha: 2026-06-05
--
-- CONTEXTO (ver docs/auditoria.md, hallazgos C1, C2, C6):
-- Los RPCs `actualizar_perfil_post_signup` (006) y `crear_empleada_post_signup`
-- (007) son SECURITY DEFINER y están GRANT EXECUTE TO authenticated. Tal como
-- estaban, CUALQUIER usuario autenticado podía invocarlos pasando un p_auth_id
-- arbitrario y p_rol='superadmin' para:
--   - reescribir la fila de OTRO usuario (hijack de cuenta), y/o
--   - elevar su propio rol hasta superadmin.
--
-- Esta migración agrega 3 guardas que NO rompen el flujo legítimo de alta
-- (verificado contra panel/users/js/users-api.js y panel/staff/js/staff-api.js,
-- donde el RPC se llama mientras la sesión es la del usuario recién creado, y
-- la fila objetivo fue creada por el trigger con rol='empleada' por defecto):
--
--   A. Whitelist de p_rol — nunca permitir 'superadmin' vía estos RPCs.
--   B. p_auth_id debe ser el usuario autenticado (auth.uid()) O el caller debe
--      ser admin/owner (tiene_acceso_admin()). Impide modificar filas ajenas.
--   C. La fila objetivo debe tener todavía el rol por defecto del trigger
--      ('empleada'). Impide que cuentas ya inicializadas (owner/admin/compras/
--      proveedor) reinvoquen el RPC para escalar.
--
-- RESIDUAL CONOCIDO (cerrar en Bloque 2):
--   Un usuario cuyo rol ACTUAL es 'empleada' todavía puede auto-asignarse
--   'owner'/'admin'/'compras' (pasa las 3 guardas). Esto NO se puede cerrar sin
--   romper el alta legítima, porque en este flujo el RPC corre con la sesión del
--   usuario recién creado (no del admin). El cierre real exige mover la creación
--   de cuentas a una Edge Function con service_role + deshabilitar el signup
--   público (Bloque 2). El "trigger anti-escalation" mencionado en docs/SCHEMA.md
--   puede ya cubrir parte de esto, pero NO está versionado y no se pudo verificar.

-- ──────────────────────────────────────────────────────────────────────────
-- RPC 1: actualizar_perfil_post_signup (reemplaza la definición de 006)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.actualizar_perfil_post_signup(
  p_auth_id  uuid,
  p_nombre   text,
  p_apellido text,
  p_telefono text,
  p_rol      text
)
RETURNS public.usuarios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row     public.usuarios;
  v_rol_act text;
BEGIN
  -- Guard A: whitelist de roles (nunca superadmin vía este RPC)
  IF p_rol IS NULL OR p_rol NOT IN ('owner','admin','compras','empleada','proveedor') THEN
    RAISE EXCEPTION 'Invalid role for self-provisioning: %', p_rol;
  END IF;

  -- Guard B: solo el propio usuario recién creado, o un admin/owner
  IF p_auth_id IS DISTINCT FROM auth.uid() AND NOT public.tiene_acceso_admin() THEN
    RAISE EXCEPTION 'Forbidden: p_auth_id must match the authenticated user';
  END IF;

  -- Guard C: la fila debe tener todavía el rol por defecto del trigger
  SELECT rol INTO v_rol_act FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_rol_act IS NULL THEN
    RAISE EXCEPTION 'No usuarios row found for auth_id=%', p_auth_id;
  END IF;
  IF v_rol_act IS DISTINCT FROM 'empleada' AND NOT public.tiene_acceso_admin() THEN
    RAISE EXCEPTION 'Profile already initialized (rol=%)', v_rol_act;
  END IF;

  UPDATE public.usuarios
  SET nombre   = p_nombre,
      apellido = p_apellido,
      telefono = p_telefono,
      rol      = p_rol,
      activo   = true
  WHERE auth_id = p_auth_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC 2: crear_empleada_post_signup (reemplaza la definición de 007)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crear_empleada_post_signup(
  p_auth_id        uuid,
  p_nombre         text,
  p_apellido       text,
  p_telefono       text,
  p_rol            text,
  p_tipo_contrato  text,
  p_fecha_inicio   date,
  p_tipos_servicio text[],
  p_notas          text,
  p_tarifa_hora    numeric
)
RETURNS public.empleadas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_usuario_id uuid;
  v_rol_act    text;
  v_empleada   public.empleadas;
BEGIN
  -- Guard A: whitelist de roles (nunca superadmin vía este RPC)
  IF p_rol IS NULL OR p_rol NOT IN ('owner','admin','compras','empleada','proveedor') THEN
    RAISE EXCEPTION 'Invalid role for self-provisioning: %', p_rol;
  END IF;

  -- Guard B: solo el propio usuario recién creado, o un admin/owner
  IF p_auth_id IS DISTINCT FROM auth.uid() AND NOT public.tiene_acceso_admin() THEN
    RAISE EXCEPTION 'Forbidden: p_auth_id must match the authenticated user';
  END IF;

  -- Guard C: la fila debe tener todavía el rol por defecto del trigger
  SELECT id, rol INTO v_usuario_id, v_rol_act
  FROM public.usuarios WHERE auth_id = p_auth_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No usuarios row found for auth_id=%', p_auth_id;
  END IF;
  IF v_rol_act IS DISTINCT FROM 'empleada' AND NOT public.tiene_acceso_admin() THEN
    RAISE EXCEPTION 'Profile already initialized (rol=%)', v_rol_act;
  END IF;

  UPDATE public.usuarios
  SET nombre = p_nombre, apellido = p_apellido, telefono = p_telefono,
      rol = p_rol, activo = true
  WHERE id = v_usuario_id;

  INSERT INTO public.empleadas (
    usuario_id, tipo_contrato, fecha_inicio, tipos_servicio, notas, tarifa_hora
  ) VALUES (
    v_usuario_id, p_tipo_contrato, p_fecha_inicio, p_tipos_servicio, p_notas, p_tarifa_hora
  )
  RETURNING * INTO v_empleada;

  RETURN v_empleada;
END;
$$;

-- Los GRANT EXECUTE TO authenticated de 006/007 siguen vigentes (el usuario
-- recién creado está autenticado y necesita ejecutar el RPC). La protección
-- ahora vive DENTRO de la función, no en quién puede invocarla.
