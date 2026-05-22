-- Migration 006: RPC actualizar_perfil_post_signup
-- Root cause: supabase.auth.signUp() reemplaza la sesión del cliente con la del
-- nuevo user (rol='empleada'). El UPDATE posterior a usuarios falla por RLS porque
-- el rol ya no es owner/superadmin sino empleada, que no puede UPDATE su propia fila.
-- Fix: mover el UPDATE a un RPC con SECURITY DEFINER que bypasa RLS.

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
  v_row public.usuarios;
BEGIN
  UPDATE public.usuarios
  SET nombre   = p_nombre,
      apellido = p_apellido,
      telefono = p_telefono,
      rol      = p_rol,
      activo   = true
  WHERE auth_id = p_auth_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No usuarios row found for auth_id=%', p_auth_id;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.actualizar_perfil_post_signup(uuid, text, text, text, text) TO authenticated;
