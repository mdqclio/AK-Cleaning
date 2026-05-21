-- Migration 005: fn_handle_new_user con SECURITY DEFINER + search_path explícito
-- Aplicada manualmente en Supabase Dashboard sesión 13 May 2026.
-- Formalizada como archivo 21 May 2026.
--
-- Contexto: el trigger debe correr con permisos de superuser (SECURITY DEFINER)
-- porque se ejecuta en el contexto de auth.users (schema auth), y necesita
-- insertar en public.usuarios que tiene RLS habilitado. Sin SECURITY DEFINER,
-- el role anon/authenticated que dispara el signUp no puede hacer el INSERT.
--
-- SET search_path = public, auth garantiza que la función puede resolver
-- referencias a ambos schemas sin ambigüedad.

CREATE OR REPLACE FUNCTION public.fn_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.usuarios (auth_id, nombre, apellido, email, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', 'Pending'),
    COALESCE(NEW.raw_user_meta_data->>'apellido', 'Setup'),
    NEW.email,
    'empleada'
  )
  ON CONFLICT (email) DO UPDATE SET auth_id = EXCLUDED.auth_id;
  RETURN NEW;
END;
$$;

-- Asegurar que el trigger sigue enganchado en auth.users
DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_handle_new_user();
