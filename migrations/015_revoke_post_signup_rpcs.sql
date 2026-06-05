-- Migration 015: Revocar EXECUTE de los RPCs *_post_signup (Bloque 2, cierre final)
-- Fecha: 2026-06-05
--
-- CONTEXTO: con la Edge Function admin-create-user deployada + serverSideAccounts
-- ON + Sign Ups públicos OFF, el alta de cuentas ya NO usa el path legacy de
-- signUp()+RPC. Los RPCs actualizar_perfil_post_signup / crear_empleada_post_signup
-- quedaron obsoletos. Revocarles EXECUTE a anon/authenticated cierra a nivel DB el
-- residual empleada→owner (defensa en profundidad).
--
-- SEGURO: la Edge Function corre con service_role (no usa estos grants). Si alguna
-- vez se reactivara el path legacy, habría que re-otorgar EXECUTE.

REVOKE EXECUTE ON FUNCTION public.actualizar_perfil_post_signup(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.crear_empleada_post_signup(uuid, text, text, text, text, text, date, text[], text, numeric)
  FROM PUBLIC, anon, authenticated;
