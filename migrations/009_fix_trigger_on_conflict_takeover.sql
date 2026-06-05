-- Migration 009: Cerrar el account-takeover por colisión de email (hallazgo C3)
-- Fecha: 2026-06-05
--
-- CONTEXTO (ver docs/auditoria.md, hallazgo C3):
-- El trigger fn_handle_new_user (005) hacía:
--     ON CONFLICT (email) DO UPDATE SET auth_id = EXCLUDED.auth_id
-- Si ya existía una fila en `usuarios` con ese email y CON auth_id (p. ej. el
-- owner Andy, o cualquier cuenta ya activa), un signUp con ese mismo email
-- REAPUNTABA la fila existente al auth_id del atacante → toma de la cuenta y su
-- rol.
--
-- FIX: solo permitir el re-link cuando la fila existente NO tiene auth_id aún.
-- Esto preserva el caso legítimo (las 17 empleadas precargadas vía SQL tienen
-- auth_id = NULL; cuando se crean sus cuentas en Block L, el trigger las
-- vincula). Pero bloquea el re-link de cualquier fila ya vinculada.
--
-- Si una fila YA tiene auth_id y llega un signUp con el mismo email, la cláusula
-- WHERE descarta el UPDATE: no hay error (ON CONFLICT lo absorbe) pero la fila
-- conserva su auth_id original. El RPC post-signup posterior no encontrará la
-- fila por el nuevo auth_id y fallará controladamente, dejando a lo sumo una
-- cuenta auth huérfana (sin perfil) — preferible a una toma de cuenta.

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
  ON CONFLICT (email) DO UPDATE
    SET auth_id = EXCLUDED.auth_id
    WHERE public.usuarios.auth_id IS NULL;   -- solo filas aún sin cuenta
  RETURN NEW;
END;
$$;

-- El trigger trg_handle_new_user (005) sigue enganchado; solo cambió el cuerpo
-- de la función. No hace falta recrear el trigger.
