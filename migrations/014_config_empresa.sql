-- Migration 014: Tabla config_empresa — datos de la empresa para la factura
-- Fecha: 2026-06-05  ·  Decisión 10 de docs/PENDIENTES-AUDITORIA.md
--
-- PROBLEMA: los datos de empresa y de pago (nombre, dirección, teléfono, banco,
-- routing, account, swift, contacto) estaban HARDCODEADOS en panel/invoices/print.html
-- y duplicados en config.js (público). Cambiarlos exigía editar código.
--
-- SOLUCIÓN: una tabla de UNA fila (id=1) con todos esos campos, editable desde
-- la UI (panel/system/config.html) por owner/superadmin. print.html los lee de
-- acá (con fallback a los literales por si la fila no existe).
--
-- RLS:
--   · SELECT: cualquier admin (tiene_acceso_admin) — print.html corre como admin.
--   · UPDATE: solo owner/superadmin.
--   · Sin INSERT/DELETE para usuarios (la fila se siembra acá; es única).

CREATE TABLE IF NOT EXISTS public.config_empresa (
  id                 integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Header / identidad
  nombre_linea1      text NOT NULL DEFAULT 'AK PROPERTY MANAGEMENT',
  nombre_linea2      text DEFAULT 'CONCIERGE SERVICES',
  ciudad             text DEFAULT 'Miami Beach, FL 33140',
  telefono           text DEFAULT '786-253-7983',
  email              text DEFAULT 'akconciergeservices@gmail.com',
  website            text DEFAULT 'www.akconciergeservices.com',
  -- Datos de pago
  payable_to         text DEFAULT 'AK Property Management Concierge Services',
  banco              text DEFAULT 'Citibank',
  routing            text DEFAULT '266086554',
  account            text DEFAULT '9135063896',
  swift              text DEFAULT 'CITIUS33',
  -- Contacto (bloque "Thank you")
  contacto_nombre    text DEFAULT 'Andrea Manca',
  contacto_telefono  text DEFAULT '786-253-7983',
  contacto_email     text DEFAULT 'andy.flo@hotmail.com',
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_por    uuid
);

-- Sembrar la fila única con los valores actuales (defaults).
INSERT INTO public.config_empresa (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.config_empresa ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier admin/owner/superadmin (print.html corre con sesión admin).
CREATE POLICY config_empresa_admin_select ON public.config_empresa
  FOR SELECT TO public
  USING (tiene_acceso_admin());

-- Escritura: solo owner/superadmin.
CREATE POLICY config_empresa_owner_update ON public.config_empresa
  FOR UPDATE TO public
  USING (get_user_rol() IN ('owner','superadmin'))
  WITH CHECK (get_user_rol() IN ('owner','superadmin'));

-- Trigger de actualizado_en (la función ya existe y se usa en otras tablas).
CREATE TRIGGER trg_config_empresa_actualizado
  BEFORE UPDATE ON public.config_empresa
  FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();
