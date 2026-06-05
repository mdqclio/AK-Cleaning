-- ============================================================================
-- 010_rls_policies_snapshot.sql — SNAPSHOT REAL de seguridad (fuente de verdad)
-- ============================================================================
-- Generado: 2026-06-05 vía MCP Supabase (execute_sql con las queries de
-- migrations/010_export_security_snapshot.sql) contra el proyecto LIVE
-- ccdpbiflbewhnidigiin.
--
-- Este archivo NO se aplica como migración nueva: es el VOLCADO de lo que hoy
-- protege la base (RLS + policies + funciones de seguridad + triggers). Sirve
-- para auditar, revisar y reproducir. Si algún día se reconstruye la DB, este
-- archivo + 008/009/011 son la referencia.
--
-- Estado verificado contra el checklist de auditoría (ver final del archivo).
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. RLS HABILITADO (30 tablas de negocio, todas ON)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cliente_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edificios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factura_adjuntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factura_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factura_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factura_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturas_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nota_credito_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_credito ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_servicio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_asignados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.os_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantilla_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plantillas_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propiedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporte_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicio_tarifas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarea_compra_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
-- factura_counter y nota_credito_counter: RLS ON sin policies (solo accesibles
-- vía funciones SECURITY DEFINER siguiente_numero_factura/devolver_numero_factura).


-- ════════════════════════════════════════════════════════════════════════════
-- 2. RLS POLICIES (58 policies)
-- ════════════════════════════════════════════════════════════════════════════

-- audit_log
CREATE POLICY audit_admin_select ON public.audit_log AS PERMISSIVE FOR SELECT TO public
  USING (tiene_acceso_admin());

-- cliente_contactos
CREATE POLICY contactos_admin_all ON public.cliente_contactos AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- clientes
CREATE POLICY clientes_admin_all ON public.clientes AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY clientes_asignado_select ON public.clientes AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND (id IN ( SELECT ordenes_servicio.cliente_id
   FROM ordenes_servicio
  WHERE es_asignado_os(ordenes_servicio.id)))));

-- edificios
CREATE POLICY edificios_admin_all ON public.edificios AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY edificios_others_select ON public.edificios AS PERMISSIVE FOR SELECT TO public
  USING ((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text, 'compras'::text])));

-- empleadas
CREATE POLICY empleadas_admin_all ON public.empleadas AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY empleadas_self_select ON public.empleadas AS PERMISSIVE FOR SELECT TO public
  USING ((usuario_id = get_usuario_id()));

-- factura_adjuntos
CREATE POLICY factura_adjuntos_admin_all ON public.factura_adjuntos AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- factura_lineas
CREATE POLICY factura_lineas_admin_all ON public.factura_lineas AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- factura_pagos
CREATE POLICY factura_pagos_admin_all ON public.factura_pagos AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- facturas
CREATE POLICY facturas_admin_all ON public.facturas AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- facturas_outbox
CREATE POLICY outbox_admin_all ON public.facturas_outbox AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- notas_credito
CREATE POLICY notas_credito_admin_all ON public.notas_credito AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- notificaciones
CREATE POLICY notif_propias ON public.notificaciones AS PERMISSIVE FOR ALL TO public
  USING ((usuario_id = get_usuario_id()))
  WITH CHECK ((usuario_id = get_usuario_id()));

-- ordenes_servicio
CREATE POLICY os_admin_all ON public.ordenes_servicio AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY os_asignado_select ON public.ordenes_servicio AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND es_asignado_os(id)));
CREATE POLICY os_asignado_update ON public.ordenes_servicio AS PERMISSIVE FOR UPDATE TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND es_asignado_os(id)))
  WITH CHECK (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND es_asignado_os(id)));

-- os_asignados
CREATE POLICY asig_admin_all ON public.os_asignados AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY asig_self_select ON public.os_asignados AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND ((empleada_id IN ( SELECT empleadas.id
   FROM empleadas
  WHERE (empleadas.usuario_id = get_usuario_id()))) OR (proveedor_id IN ( SELECT proveedores.id
   FROM proveedores
  WHERE (proveedores.usuario_id = get_usuario_id()))))));
CREATE POLICY asig_self_update ON public.os_asignados AS PERMISSIVE FOR UPDATE TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND ((empleada_id IN ( SELECT empleadas.id
   FROM empleadas
  WHERE (empleadas.usuario_id = get_usuario_id()))) OR (proveedor_id IN ( SELECT proveedores.id
   FROM proveedores
  WHERE (proveedores.usuario_id = get_usuario_id()))))))
  WITH CHECK (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND ((empleada_id IN ( SELECT empleadas.id
   FROM empleadas
  WHERE (empleadas.usuario_id = get_usuario_id()))) OR (proveedor_id IN ( SELECT proveedores.id
   FROM proveedores
  WHERE (proveedores.usuario_id = get_usuario_id()))))));

-- os_checklist
CREATE POLICY checklist_admin_all ON public.os_checklist AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY checklist_asignado_select ON public.os_checklist AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND es_asignado_os(os_id)));
CREATE POLICY checklist_asignado_update ON public.os_checklist AS PERMISSIVE FOR UPDATE TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND es_asignado_os(os_id)))
  WITH CHECK (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND es_asignado_os(os_id)));

-- os_servicios
CREATE POLICY os_servicios_admin_all ON public.os_servicios AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY os_servicios_asignado_select ON public.os_servicios AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND es_asignado_os(os_id)));

-- pagos
CREATE POLICY pagos_admin_all ON public.pagos AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- plantilla_items
CREATE POLICY plantilla_items_admin_all ON public.plantilla_items AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY plantilla_items_others_select ON public.plantilla_items AS PERMISSIVE FOR SELECT TO public
  USING ((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])));

-- plantillas_checklist
CREATE POLICY plantillas_admin_all ON public.plantillas_checklist AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY plantillas_others_select ON public.plantillas_checklist AS PERMISSIVE FOR SELECT TO public
  USING ((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])));

-- propiedades
CREATE POLICY propiedades_admin_all ON public.propiedades AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY propiedades_asignado_select ON public.propiedades AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND (id IN ( SELECT ordenes_servicio.propiedad_id
   FROM ordenes_servicio
  WHERE es_asignado_os(ordenes_servicio.id)))));
CREATE POLICY propiedades_compras_select ON public.propiedades AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = 'compras'::text) AND (id IN ( SELECT tareas.propiedad_id
   FROM tareas
  WHERE (tareas.tipo = 'compra'::text)))));

-- proveedores
CREATE POLICY proveedores_admin_all ON public.proveedores AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY proveedores_self_select ON public.proveedores AS PERMISSIVE FOR SELECT TO public
  USING ((usuario_id = get_usuario_id()));

-- recurrencias
CREATE POLICY recurrencias_admin_all ON public.recurrencias AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- reporte_fotos
CREATE POLICY fotos_admin_all ON public.reporte_fotos AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY fotos_field_insert ON public.reporte_fotos AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND (reporte_id IN ( SELECT reportes.id
   FROM reportes
  WHERE (reportes.creado_por = get_usuario_id())))));
CREATE POLICY fotos_field_select ON public.reporte_fotos AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND (reporte_id IN ( SELECT reportes.id
   FROM reportes
  WHERE (reportes.creado_por = get_usuario_id())))));

-- reportes
CREATE POLICY reportes_admin_all ON public.reportes AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY reportes_compras_select ON public.reportes AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = 'compras'::text) AND (tipo = 'insumo_faltante'::text)));
CREATE POLICY reportes_compras_update ON public.reportes AS PERMISSIVE FOR UPDATE TO public
  USING (((get_user_rol() = 'compras'::text) AND (tipo = 'insumo_faltante'::text)))
  WITH CHECK (((get_user_rol() = 'compras'::text) AND (tipo = 'insumo_faltante'::text)));
CREATE POLICY reportes_field_insert ON public.reportes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND (creado_por = get_usuario_id())));
CREATE POLICY reportes_field_select ON public.reportes AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND (creado_por = get_usuario_id())));

-- servicio_tarifas
CREATE POLICY tarifas_admin_all ON public.servicio_tarifas AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());

-- servicios
CREATE POLICY servicios_admin_all ON public.servicios AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY servicios_others_select ON public.servicios AS PERMISSIVE FOR SELECT TO public
  USING ((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text, 'compras'::text])));

-- tarea_compra_items
CREATE POLICY compra_items_admin_all ON public.tarea_compra_items AS PERMISSIVE FOR ALL TO public
  USING ((get_user_rol() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'admin'::text, 'compras'::text])))
  WITH CHECK ((get_user_rol() = ANY (ARRAY['superadmin'::text, 'owner'::text, 'admin'::text, 'compras'::text])));

-- tareas
CREATE POLICY tareas_admin_all ON public.tareas AS PERMISSIVE FOR ALL TO public
  USING (tiene_acceso_admin())
  WITH CHECK (tiene_acceso_admin());
CREATE POLICY tareas_asignada_select ON public.tareas AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = ANY (ARRAY['empleada'::text, 'proveedor'::text])) AND (asignada_a = get_usuario_id())));
CREATE POLICY tareas_compras_insert ON public.tareas AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((get_user_rol() = 'compras'::text) AND (tipo = 'compra'::text)));
CREATE POLICY tareas_compras_select ON public.tareas AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = 'compras'::text) AND (tipo = 'compra'::text)));
CREATE POLICY tareas_compras_update ON public.tareas AS PERMISSIVE FOR UPDATE TO public
  USING (((get_user_rol() = 'compras'::text) AND (tipo = 'compra'::text)))
  WITH CHECK (((get_user_rol() = 'compras'::text) AND (tipo = 'compra'::text)));

-- usuarios
CREATE POLICY usuarios_owner_insert ON public.usuarios AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((get_user_rol() = 'owner'::text) AND (rol <> 'superadmin'::text)));
CREATE POLICY usuarios_owner_select ON public.usuarios AS PERMISSIVE FOR SELECT TO public
  USING (((get_user_rol() = 'owner'::text) AND (rol <> 'superadmin'::text)));
CREATE POLICY usuarios_owner_update ON public.usuarios AS PERMISSIVE FOR UPDATE TO public
  USING (((get_user_rol() = 'owner'::text) AND (rol <> 'superadmin'::text)))
  WITH CHECK (((get_user_rol() = 'owner'::text) AND (rol <> 'superadmin'::text)));
CREATE POLICY usuarios_self_select ON public.usuarios AS PERMISSIVE FOR SELECT TO public
  USING ((auth_id = auth.uid()));
CREATE POLICY usuarios_superadmin_all ON public.usuarios AS PERMISSIVE FOR ALL TO public
  USING (es_superadmin())
  WITH CHECK (es_superadmin());


-- ════════════════════════════════════════════════════════════════════════════
-- 3. FUNCIONES DE SEGURIDAD (helpers RLS + guards + counters)
-- ════════════════════════════════════════════════════════════════════════════
-- (Cuerpos completos tal como están en la DB. actualizar_perfil_post_signup,
-- crear_empleada_post_signup y fn_handle_new_user vienen de 008/009 — no se
-- repiten acá para evitar drift; ver esos archivos.)

CREATE OR REPLACE FUNCTION public.get_user_rol()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT rol FROM usuarios WHERE auth_id = auth.uid() AND activo = TRUE $function$;

CREATE OR REPLACE FUNCTION public.get_usuario_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT id FROM usuarios WHERE auth_id = auth.uid() AND activo = TRUE $function$;

CREATE OR REPLACE FUNCTION public.tiene_acceso_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT get_user_rol() IN ('superadmin','owner','admin') $function$;

CREATE OR REPLACE FUNCTION public.es_superadmin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_id = auth.uid() AND rol = 'superadmin' AND activo = TRUE
  )
$function$;

CREATE OR REPLACE FUNCTION public.es_asignado_os(p_os_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM os_asignados oa
    LEFT JOIN empleadas e ON e.id = oa.empleada_id
    LEFT JOIN proveedores p ON p.id = oa.proveedor_id
    WHERE oa.os_id = p_os_id
      AND (e.usuario_id = get_usuario_id() OR p.usuario_id = get_usuario_id())
  )
$function$;

CREATE OR REPLACE FUNCTION public.fn_proteger_superadmin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  -- Caso a): asignar rol superadmin requiere ser superadmin
  IF NEW.rol = 'superadmin' AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Only superadmin can assign superadmin role';
  END IF;
  -- Caso b): modificar usuario superadmin existente requiere ser superadmin
  IF TG_OP = 'UPDATE' AND OLD.rol = 'superadmin' AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Only superadmin can modify a superadmin user';
  END IF;
  -- Caso b'): borrar superadmin requiere ser superadmin
  IF TG_OP = 'DELETE' AND OLD.rol = 'superadmin' AND NOT es_superadmin() THEN
    RAISE EXCEPTION 'Only superadmin can delete a superadmin user';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_proteger_factura_emitida()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.estado IN ('enviada', 'pagada') THEN
    IF NEW.numero            IS DISTINCT FROM OLD.numero
       OR NEW.cliente_id     IS DISTINCT FROM OLD.cliente_id
       OR NEW.subtotal       IS DISTINCT FROM OLD.subtotal
       OR NEW.total_due      IS DISTINCT FROM OLD.total_due
       OR NEW.fecha          IS DISTINCT FROM OLD.fecha
       OR NEW.bill_to_name   IS DISTINCT FROM OLD.bill_to_name
       OR NEW.bill_to_email  IS DISTINCT FROM OLD.bill_to_email
       OR NEW.bill_to_address_1 IS DISTINCT FROM OLD.bill_to_address_1
       OR NEW.bill_to_address_2 IS DISTINCT FROM OLD.bill_to_address_2
       OR NEW.bill_to_city   IS DISTINCT FROM OLD.bill_to_city
       OR NEW.bill_to_state  IS DISTINCT FROM OLD.bill_to_state
       OR NEW.bill_to_zip    IS DISTINCT FROM OLD.bill_to_zip
       OR NEW.for_property_unit IS DISTINCT FROM OLD.for_property_unit
       OR NEW.for_service_period IS DISTINCT FROM OLD.for_service_period
       OR NEW.for_description IS DISTINCT FROM OLD.for_description
    THEN
      RAISE EXCEPTION 'Cannot modify critical fields on a sent/paid invoice. Use a credit note instead.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_audit_log()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_cambios JSONB;
  v_usuario_id UUID;
BEGIN
  v_usuario_id := get_usuario_id();
  IF TG_OP = 'INSERT' THEN
    v_cambios := to_jsonb(NEW);
    INSERT INTO audit_log (tabla, fila_id, operacion, cambios, usuario_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_cambios, v_usuario_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_cambios := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    INSERT INTO audit_log (tabla, fila_id, operacion, cambios, usuario_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_cambios, v_usuario_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_cambios := to_jsonb(OLD);
    INSERT INTO audit_log (tabla, fila_id, operacion, cambios, usuario_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_cambios, v_usuario_id);
    RETURN OLD;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_incrementar_version()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.siguiente_numero_factura()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_numero INTEGER;
BEGIN
  SELECT proximo_numero INTO v_numero FROM factura_counter WHERE id = 1 FOR UPDATE;
  UPDATE factura_counter SET proximo_numero = proximo_numero + 1 WHERE id = 1;
  RETURN v_numero;
END;
$function$;

CREATE OR REPLACE FUNCTION public.devolver_numero_factura(p_numero integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_actual integer;
BEGIN
  SELECT proximo_numero INTO v_actual FROM factura_counter WHERE id = 1 FOR UPDATE;
  IF v_actual = p_numero + 1 THEN
    UPDATE factura_counter SET proximo_numero = p_numero WHERE id = 1;
    RETURN true;
  END IF;
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalcular_estado_factura(p_factura_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_estado_actual text;
  v_total         numeric;
  v_pagado        numeric;
  v_nuevo_estado  text;
BEGIN
  SELECT estado, total_due INTO v_estado_actual, v_total
  FROM facturas WHERE id = p_factura_id FOR UPDATE;
  IF v_estado_actual IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada: %', p_factura_id;
  END IF;
  IF v_estado_actual IN ('borrador', 'anulada') THEN
    RETURN v_estado_actual;
  END IF;
  SELECT COALESCE(SUM(monto), 0) INTO v_pagado
  FROM factura_pagos WHERE factura_id = p_factura_id;
  IF v_pagado <= 0 THEN
    v_nuevo_estado := 'generada';
  ELSIF v_pagado >= v_total THEN
    v_nuevo_estado := 'pagada';
  ELSE
    v_nuevo_estado := 'parcialmente_pagada';
  END IF;
  IF v_nuevo_estado <> v_estado_actual THEN
    UPDATE facturas SET estado = v_nuevo_estado WHERE id = p_factura_id;
  END IF;
  RETURN v_nuevo_estado;
END;
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. TRIGGERS
-- ════════════════════════════════════════════════════════════════════════════
CREATE TRIGGER trg_audit_clientes AFTER INSERT OR DELETE OR UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_clientes_actualizado BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();
CREATE TRIGGER trg_empleadas_actualizado BEFORE UPDATE ON public.empleadas FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();
CREATE TRIGGER trg_audit_facturas AFTER INSERT OR DELETE OR UPDATE ON public.facturas FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_facturas_actualizado BEFORE UPDATE ON public.facturas FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();
CREATE TRIGGER trg_facturas_inmutables BEFORE UPDATE ON public.facturas FOR EACH ROW EXECUTE FUNCTION fn_proteger_factura_emitida();
CREATE TRIGGER trg_facturas_version BEFORE UPDATE ON public.facturas FOR EACH ROW EXECUTE FUNCTION fn_incrementar_version();
CREATE TRIGGER trg_audit_notas_credito AFTER INSERT OR DELETE OR UPDATE ON public.notas_credito FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_audit_os AFTER INSERT OR DELETE OR UPDATE ON public.ordenes_servicio FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_os_actualizado BEFORE UPDATE ON public.ordenes_servicio FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();
CREATE TRIGGER trg_os_version BEFORE UPDATE ON public.ordenes_servicio FOR EACH ROW EXECUTE FUNCTION fn_incrementar_version();
CREATE TRIGGER trg_audit_pagos AFTER INSERT OR DELETE OR UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_propiedades_actualizado BEFORE UPDATE ON public.propiedades FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();
CREATE TRIGGER trg_proveedores_actualizado BEFORE UPDATE ON public.proveedores FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();
CREATE TRIGGER trg_recurrencias_actualizado BEFORE UPDATE ON public.recurrencias FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();
CREATE TRIGGER trg_reportes_inmutable_update BEFORE DELETE OR UPDATE ON public.reportes FOR EACH ROW EXECUTE FUNCTION fn_proteger_reporte_inmutable();
CREATE TRIGGER trg_tareas_actualizado BEFORE UPDATE ON public.tareas FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();
CREATE TRIGGER trg_handle_new_user AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();
CREATE TRIGGER trg_proteger_superadmin BEFORE INSERT OR DELETE OR UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_proteger_superadmin();
CREATE TRIGGER trg_usuarios_actualizado BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION fn_actualizado_en();


-- ════════════════════════════════════════════════════════════════════════════
-- CHECKLIST DE VERIFICACIÓN (auditoría) — resultado 2026-06-05
-- ════════════════════════════════════════════════════════════════════════════
-- [x] `usuarios` RLS ON.
-- [x] No-superadmin no puede asignar rol 'superadmin':
--       · RLS usuarios_owner_{insert,update} con WITH CHECK (rol <> 'superadmin')
--       · trigger fn_proteger_superadmin Caso a (NEW.rol='superadmin' → exige es_superadmin)
-- [x] Self-promotion bloqueada por RLS: no existe policy UPDATE de usuarios para
--     'empleada'/'proveedor'/'compras' → vía PostgREST no pueden cambiar su rol.
--     RESIDUAL: vía RPC actualizar_perfil_post_signup, una fila aún rol='empleada'
--     puede auto-asignarse owner/admin/compras (NO superadmin, lo frena 008 Guard A).
--     Cierre real = Bloque 2 (Edge Function + signup público off).
-- [x] `facturas`, `factura_lineas`, `factura_pagos`: SELECT solo tiene_acceso_admin()
--     → cierra el IDOR de print.html.
-- [~] `empleadas.tarifa_hora`: visible a admin (empleadas_admin_all) y a la PROPIA
--     empleada (empleadas_self_select). No se filtra por columna. Aceptable: cada
--     empleada solo ve su tarifa. Revisar si se quiere ocultar incluso a sí misma.
-- [x] Owner NO ve filas superadmin: usuarios_owner_select con rol <> 'superadmin'.
-- [~] SELECT abierto a authenticated sin filtro de fila (datos de referencia,
--     aceptado): edificios_others_select, servicios_others_select,
--     plantillas_others_select, plantilla_items_others_select.
