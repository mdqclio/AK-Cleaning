-- Migration 011: RPCs transaccionales para escrituras multi-tabla
-- Fecha: 2026-06-05  ·  Bloque 3 de docs/auditoria.md (items 8 y 9)
--
-- PROBLEMA:
-- Varias operaciones hacen "update cabecera" + "delete hijos" + "insert hijos"
-- como llamadas separadas desde el cliente. Si el insert falla a mitad, quedan
-- datos corruptos (factura sin líneas con totales viejos; orden sin servicios;
-- contactos perdidos). Además la numeración de facturas tenía un TOCTOU entre el
-- chequeo de version y el UPDATE.
--
-- ESTAS FUNCIONES corren cada operación en UNA transacción (atómica: o todo o
-- nada) y aplican el lock optimista por `version` dentro del mismo statement.
-- Son SECURITY INVOKER: respetan la RLS del que llama (no son bypass de permisos,
-- solo dan atomicidad).
--
-- WIRING: el cliente las usa cuando APP_CONFIG.features.transactionalWrites = true
-- (default false). Mientras tanto el cliente usa el path legacy, ya endurecido con
-- locks de version. Activar el flag DESPUÉS de aplicar esta migración y testear.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. guardar_factura_con_lineas — update cabecera + reemplazo de líneas atómico
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guardar_factura_con_lineas(
  p_id      uuid,
  p_datos   jsonb,
  p_lineas  jsonb,
  p_version integer
)
RETURNS public.facturas
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_factura public.facturas;
  v_linea   jsonb;
  v_orden   integer := 0;
BEGIN
  -- Lock optimista + update de columnas editables (whitelist). Solo aplica las
  -- claves presentes en p_datos; el resto queda intacto.
  UPDATE public.facturas SET
    cliente_id          = CASE WHEN p_datos ? 'cliente_id'          THEN (p_datos->>'cliente_id')::uuid          ELSE cliente_id END,
    propiedad_id        = CASE WHEN p_datos ? 'propiedad_id'        THEN NULLIF(p_datos->>'propiedad_id','')::uuid ELSE propiedad_id END,
    fecha               = CASE WHEN p_datos ? 'fecha'               THEN (p_datos->>'fecha')::date               ELSE fecha END,
    descripcion_general = CASE WHEN p_datos ? 'descripcion_general' THEN  p_datos->>'descripcion_general'        ELSE descripcion_general END,
    periodo_servicio    = CASE WHEN p_datos ? 'periodo_servicio'    THEN  p_datos->>'periodo_servicio'           ELSE periodo_servicio END,
    notas               = CASE WHEN p_datos ? 'notas'               THEN  p_datos->>'notas'                      ELSE notas END,
    subtotal            = CASE WHEN p_datos ? 'subtotal'            THEN (p_datos->>'subtotal')::numeric         ELSE subtotal END,
    tax_total           = CASE WHEN p_datos ? 'tax_total'           THEN (p_datos->>'tax_total')::numeric        ELSE tax_total END,
    descuento_total     = CASE WHEN p_datos ? 'descuento_total'     THEN (p_datos->>'descuento_total')::numeric   ELSE descuento_total END,
    total_due           = CASE WHEN p_datos ? 'total_due'           THEN (p_datos->>'total_due')::numeric        ELSE total_due END
  WHERE id = p_id AND version = p_version
  RETURNING * INTO v_factura;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invoice was modified by someone else. Please reload and try again.'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Reemplazo de líneas (delete + insert) en la misma transacción
  DELETE FROM public.factura_lineas WHERE factura_id = p_id;

  IF p_lineas IS NOT NULL AND jsonb_typeof(p_lineas) = 'array' THEN
    FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
      v_orden := v_orden + 1;
      INSERT INTO public.factura_lineas (
        factura_id, os_id, os_servicio_id, fecha, descripcion,
        qty, precio_unitario, descuento, taxable, tax_pct, tax_monto, total, orden
      ) VALUES (
        p_id,
        NULLIF(v_linea->>'os_id','')::uuid,
        NULLIF(v_linea->>'os_servicio_id','')::uuid,
        NULLIF(v_linea->>'fecha','')::date,
        COALESCE(v_linea->>'descripcion',''),
        COALESCE((v_linea->>'qty')::numeric, 1),
        COALESCE((v_linea->>'precio_unitario')::numeric, 0),
        COALESCE((v_linea->>'descuento')::numeric, 0),
        COALESCE((v_linea->>'taxable')::boolean, false),
        COALESCE((v_linea->>'tax_pct')::numeric, 0),
        COALESCE((v_linea->>'tax_monto')::numeric, 0),
        COALESCE((v_linea->>'total')::numeric, 0),
        v_orden
      );
    END LOOP;
  END IF;

  RETURN v_factura;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. generar_numero_factura — numeración atómica con lock de version
--    (reemplaza el baile de 3 pasos del cliente; un solo statement transaccional)
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.generar_numero_factura_seguro(
  p_id      uuid,
  p_version integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER  -- usa siguiente_numero_factura() que es SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero integer;
BEGIN
  -- Reservar el número (atómico, FOR UPDATE en el counter)
  v_numero := public.siguiente_numero_factura();
  IF v_numero IS NULL THEN
    RAISE EXCEPTION 'Could not assign invoice number. Please try again.';
  END IF;

  -- Asignarlo solo si la version coincide (no cambió desde que el usuario lo vio)
  UPDATE public.facturas
  SET numero = v_numero, estado = 'generada'
  WHERE id = p_id AND version = p_version AND estado = 'borrador';

  IF NOT FOUND THEN
    -- Devolver el número reservado; nada quedó asignado
    PERFORM public.devolver_numero_factura(v_numero);
    RAISE EXCEPTION 'This invoice was modified by someone else. Please reload and try again.'
      USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN v_numero;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generar_numero_factura_seguro(uuid, integer) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. crear_orden_completa — insert orden + servicios + asignados atómico
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.crear_orden_completa(
  p_datos      jsonb,
  p_servicios  jsonb,
  p_asignados  jsonb
)
RETURNS public.ordenes_servicio
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_orden public.ordenes_servicio;
  v_item  jsonb;
BEGIN
  INSERT INTO public.ordenes_servicio
  SELECT * FROM jsonb_populate_record(NULL::public.ordenes_servicio, p_datos)
  RETURNING * INTO v_orden;

  IF p_servicios IS NOT NULL AND jsonb_typeof(p_servicios) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_servicios) LOOP
      INSERT INTO public.os_servicios (os_id, servicio_id, cantidad, precio_unitario, notas)
      VALUES (
        v_orden.id,
        (v_item->>'servicio_id')::uuid,
        COALESCE((v_item->>'cantidad')::numeric, 1),
        COALESCE((v_item->>'precio_unitario')::numeric, 0),
        NULLIF(v_item->>'notas','')
      );
    END LOOP;
  END IF;

  IF p_asignados IS NOT NULL AND jsonb_typeof(p_asignados) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_asignados) LOOP
      INSERT INTO public.os_asignados (os_id, empleada_id, proveedor_id, rol_en_os)
      VALUES (
        v_orden.id,
        NULLIF(v_item->>'empleada_id','')::uuid,
        NULLIF(v_item->>'proveedor_id','')::uuid,
        NULLIF(v_item->>'rol_en_os','')
      );
    END LOOP;
  END IF;

  RETURN v_orden;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. actualizar_orden_completa — update + reemplazo de hijos atómico, con lock
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.actualizar_orden_completa(
  p_id         uuid,
  p_datos      jsonb,
  p_servicios  jsonb,
  p_asignados  jsonb,
  p_version    integer
)
RETURNS public.ordenes_servicio
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_orden  public.ordenes_servicio;
  v_actual public.ordenes_servicio;
  v_item   jsonb;
BEGIN
  SELECT * INTO v_actual FROM public.ordenes_servicio WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_actual.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION 'This order was modified by someone else. Please reload and try again.'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Merge: la fila actual pisada con las claves presentes en p_datos
  UPDATE public.ordenes_servicio o
  SET (cliente_id, propiedad_id, estado, programada_en, descripcion,
       notas_internas, costo_final, actualizado_por) =
      (r.cliente_id, r.propiedad_id, r.estado, r.programada_en, r.descripcion,
       r.notas_internas, r.costo_final, r.actualizado_por)
  FROM (
    SELECT * FROM jsonb_populate_record(v_actual, p_datos)
  ) r
  WHERE o.id = p_id
  RETURNING o.* INTO v_orden;

  DELETE FROM public.os_servicios WHERE os_id = p_id;
  IF p_servicios IS NOT NULL AND jsonb_typeof(p_servicios) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_servicios) LOOP
      INSERT INTO public.os_servicios (os_id, servicio_id, cantidad, precio_unitario, notas)
      VALUES (
        p_id, (v_item->>'servicio_id')::uuid,
        COALESCE((v_item->>'cantidad')::numeric, 1),
        COALESCE((v_item->>'precio_unitario')::numeric, 0),
        NULLIF(v_item->>'notas','')
      );
    END LOOP;
  END IF;

  DELETE FROM public.os_asignados WHERE os_id = p_id;
  IF p_asignados IS NOT NULL AND jsonb_typeof(p_asignados) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_asignados) LOOP
      INSERT INTO public.os_asignados (os_id, empleada_id, proveedor_id, rol_en_os)
      VALUES (
        p_id,
        NULLIF(v_item->>'empleada_id','')::uuid,
        NULLIF(v_item->>'proveedor_id','')::uuid,
        NULLIF(v_item->>'rol_en_os','')
      );
    END LOOP;
  END IF;

  RETURN v_orden;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. guardar_contactos_cliente — reemplazo atómico de contactos
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guardar_contactos_cliente(
  p_cliente_id uuid,
  p_contactos  jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
BEGIN
  DELETE FROM public.cliente_contactos WHERE cliente_id = p_cliente_id;

  IF p_contactos IS NOT NULL AND jsonb_typeof(p_contactos) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_contactos) LOOP
      INSERT INTO public.cliente_contactos (cliente_id, nombre, email, telefono, rol, es_principal)
      VALUES (
        p_cliente_id,
        COALESCE(v_item->>'nombre',''),
        NULLIF(v_item->>'email',''),
        NULLIF(v_item->>'telefono',''),
        NULLIF(v_item->>'rol',''),
        COALESCE((v_item->>'es_principal')::boolean, false)
      );
    END LOOP;
  END IF;
END;
$$;

-- NOTA: verificar los nombres de columnas reales contra docs/SCHEMA.md antes de
-- aplicar (especialmente cliente_contactos y ordenes_servicio). Ajustar si difiere.
