-- Migration 007: RPC crear_empleada_post_signup
-- El INSERT a empleadas exige tiene_acceso_admin() (policy empleadas_admin_all).
-- Tras signUp la sesión es la del nuevo empleado (no pasa ese check) y el
-- setSession para restaurar al admin es poco confiable -> INSERT rechazado ->
-- huérfano. Fix: UPDATE usuarios + INSERT empleadas en UN RPC SECURITY DEFINER
-- y atómico (si falla el INSERT, se revierte el UPDATE -> nunca queda huérfano).

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
  v_empleada   public.empleadas;
BEGIN
  UPDATE public.usuarios
  SET nombre = p_nombre, apellido = p_apellido, telefono = p_telefono,
      rol = p_rol, activo = true
  WHERE auth_id = p_auth_id
  RETURNING id INTO v_usuario_id;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No usuarios row found for auth_id=%', p_auth_id;
  END IF;

  INSERT INTO public.empleadas (
    usuario_id, tipo_contrato, fecha_inicio, tipos_servicio, notas, tarifa_hora
  ) VALUES (
    v_usuario_id, p_tipo_contrato, p_fecha_inicio, p_tipos_servicio, p_notas, p_tarifa_hora
  )
  RETURNING * INTO v_empleada;

  RETURN v_empleada;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crear_empleada_post_signup(
  uuid, text, text, text, text, text, date, text[], text, numeric
) TO authenticated;
