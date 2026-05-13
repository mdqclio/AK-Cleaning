// panel/orders/js/orders-api.js
// Funciones de acceso a Supabase para Service Orders.
// CRUD completo + dropdowns de clientes/propiedades/servicios/staff/providers.

import { supabase } from '../../../js/supabase-client.js';

// ─── LISTADO ─────────────────────────────────────────

export async function listarOrdenes({
  busqueda = '',
  estado = 'all',
  cliente_id = 'all',
  asignado = 'all',
  fechaDesde = null,
  fechaHasta = null,
  vista = 'all',
  pagina = 1,
  porPagina = 20
} = {}) {

  let query = supabase
    .from('ordenes_servicio')
    .select(`
      *,
      clientes(id, nombre, apellido, razon_social),
      propiedades(id, nombre_referencia, edificios(nombre)),
      os_servicios(id, cantidad, precio_unitario, servicios(nombre_en)),
      os_asignados(id, empleada_id, proveedor_id, rol_en_os, estado,
                   empleadas(id, usuarios(nombre, apellido)),
                   proveedores(id, nombre_empresa))
    `, { count: 'exact' });

  if (estado !== 'all') query = query.eq('estado', estado);
  if (cliente_id !== 'all') query = query.eq('cliente_id', cliente_id);

  const ahora = new Date();
  if (vista === 'today') {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date();
    finHoy.setHours(23, 59, 59, 999);
    query = query.gte('programada_en', inicioHoy.toISOString())
                 .lte('programada_en', finHoy.toISOString());
  } else if (vista === 'upcoming') {
    query = query.gte('programada_en', ahora.toISOString());
  } else if (vista === 'past') {
    query = query.lt('programada_en', ahora.toISOString());
  } else if (fechaDesde || fechaHasta) {
    if (fechaDesde) query = query.gte('programada_en', new Date(fechaDesde).toISOString());
    if (fechaHasta) {
      const fin = new Date(fechaHasta);
      fin.setHours(23, 59, 59, 999);
      query = query.lte('programada_en', fin.toISOString());
    }
  }

  if (busqueda) {
    const s = `%${busqueda}%`;
    query = query.or(`descripcion.ilike.${s},notas_internas.ilike.${s}`);
  }

  query = query.order('programada_en', { ascending: vista !== 'past' });
  const desde = (pagina - 1) * porPagina;
  const hasta = desde + porPagina - 1;
  query = query.range(desde, hasta);

  const { data, count, error } = await query;

  let filtered = data || [];
  if (asignado !== 'all' && filtered.length > 0) {
    const [tipo, id] = asignado.split(':');
    filtered = filtered.filter(os =>
      os.os_asignados?.some(a => {
        if (tipo === 'staff') return a.empleada_id === id;
        if (tipo === 'provider') return a.proveedor_id === id;
        return false;
      })
    );
  }

  return { data: filtered, count: count || 0, error };
}

// ─── DETALLE ─────────────────────────────────────────

export async function obtenerOrden(id) {
  const { data, error } = await supabase
    .from('ordenes_servicio')
    .select(`
      *,
      clientes(id, nombre, apellido, razon_social, email, telefono),
      propiedades(id, nombre_referencia, tipo, unidad,
                  direccion_1, ciudad, state, zip,
                  acceso_codigo, acceso_porteria, acceso_llave, notas_especiales,
                  edificios(nombre, direccion_1, ciudad, state, zip)),
      os_servicios(*, servicios(id, nombre_en, nombre_es, taxable)),
      os_asignados(*, empleadas(id, usuarios(nombre, apellido, telefono)),
                      proveedores(id, nombre_empresa, contacto_nombre, telefono)),
      creado_por_user:usuarios!ordenes_servicio_creado_por_fkey(nombre, apellido),
      actualizado_por_user:usuarios!ordenes_servicio_actualizado_por_fkey(nombre, apellido)
    `)
    .eq('id', id)
    .single();
  return { orden: data, error };
}

// ─── CREAR ───────────────────────────────────────────

export async function crearOrden(datosOS, servicios, asignados) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuarioActual } = await supabase
    .from('usuarios').select('id').eq('auth_id', user.id).single();

  const { data: orden, error: errOS } = await supabase
    .from('ordenes_servicio')
    .insert({ ...datosOS, creado_por: usuarioActual?.id })
    .select()
    .single();

  if (errOS) return { orden: null, error: errOS };

  if (servicios.length > 0) {
    const filas = servicios.map(s => ({
      os_id: orden.id,
      servicio_id: s.servicio_id,
      cantidad: parseFloat(s.cantidad) || 1,
      precio_unitario: parseFloat(s.precio_unitario) || 0,
      notas: s.notas || null
    }));
    const { error: errSrv } = await supabase.from('os_servicios').insert(filas);
    if (errSrv) return { orden, error: errSrv };
  }

  if (asignados.length > 0) {
    const filas = asignados.map(a => ({
      os_id: orden.id,
      empleada_id: a.tipo === 'staff' ? a.id : null,
      proveedor_id: a.tipo === 'provider' ? a.id : null,
      rol_en_os: a.rol_en_os || null
    }));
    const { error: errAsig } = await supabase.from('os_asignados').insert(filas);
    if (errAsig) return { orden, error: errAsig };
  }

  return { orden, error: null };
}

// ─── ACTUALIZAR ──────────────────────────────────────

export async function actualizarOrden(id, datosOS, servicios, asignados, version) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuarioActual } = await supabase
    .from('usuarios').select('id').eq('auth_id', user.id).single();

  const { data: actual } = await supabase
    .from('ordenes_servicio').select('version').eq('id', id).single();
  if (actual?.version !== version) {
    return { error: { message: 'This order was modified by someone else. Please reload and try again.' } };
  }

  const { error: errOS } = await supabase
    .from('ordenes_servicio')
    .update({ ...datosOS, actualizado_por: usuarioActual?.id })
    .eq('id', id);

  if (errOS) return { error: errOS };

  await supabase.from('os_servicios').delete().eq('os_id', id);
  if (servicios.length > 0) {
    const filas = servicios.map(s => ({
      os_id: id,
      servicio_id: s.servicio_id,
      cantidad: parseFloat(s.cantidad) || 1,
      precio_unitario: parseFloat(s.precio_unitario) || 0,
      notas: s.notas || null
    }));
    const { error: errSrv } = await supabase.from('os_servicios').insert(filas);
    if (errSrv) return { error: errSrv };
  }

  await supabase.from('os_asignados').delete().eq('os_id', id);
  if (asignados.length > 0) {
    const filas = asignados.map(a => ({
      os_id: id,
      empleada_id: a.tipo === 'staff' ? a.id : null,
      proveedor_id: a.tipo === 'provider' ? a.id : null,
      rol_en_os: a.rol_en_os || null
    }));
    const { error: errAsig } = await supabase.from('os_asignados').insert(filas);
    if (errAsig) return { error: errAsig };
  }

  return { error: null };
}

// ─── DROPDOWNS ───────────────────────────────────────

export async function listarClientesActivos() {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, apellido, razon_social')
    .eq('activo', true)
    .order('apellido');
  return { data: data || [], error };
}

export async function listarPropiedadesDeCliente(cliente_id) {
  if (!cliente_id) return { data: [], error: null };
  const { data, error } = await supabase
    .from('propiedades')
    .select('id, nombre_referencia, tipo, unidad, edificios(nombre)')
    .eq('cliente_id', cliente_id)
    .eq('activa', true)
    .order('nombre_referencia');
  return { data: data || [], error };
}

export async function listarServiciosActivos() {
  const { data, error } = await supabase
    .from('servicios')
    .select(`
      id, nombre_en, nombre_es, categoria, requiere_proveedor_externo, taxable,
      servicio_tarifas(precio, unidad, vigente_desde, vigente_hasta)
    `)
    .eq('activo', true)
    .order('nombre_en');

  const hoy = new Date().toISOString().split('T')[0];
  const enriquecidos = (data || []).map(s => {
    const tarifaVigente = (s.servicio_tarifas || []).find(t =>
      t.vigente_desde <= hoy && (!t.vigente_hasta || t.vigente_hasta >= hoy)
    );
    return {
      ...s,
      precio_actual: tarifaVigente?.precio || 0,
      unidad_actual: tarifaVigente?.unidad || 'flat'
    };
  });

  return { data: enriquecidos, error };
}

export async function listarStaffActivos() {
  const { data, error } = await supabase
    .from('empleadas')
    .select('id, tipos_servicio, usuarios!inner(nombre, apellido, activo)')
    .eq('usuarios.activo', true)
    .order('apellido', { foreignTable: 'usuarios' });
  return { data: data || [], error };
}

export async function listarProveedoresActivos() {
  const { data, error } = await supabase
    .from('proveedores')
    .select('id, nombre_empresa, contacto_nombre, rubros')
    .eq('activo', true)
    .order('nombre_empresa');
  return { data: data || [], error };
}

// ─── ERROR HELPER ────────────────────────────────────

export function traducirError(error) {
  if (!error) return null;
  const msg = error.message || error.toString();
  if (msg.includes('was modified by someone else')) return msg;
  if (msg.includes('chk_asignado_xor'))    return 'Each assignment must be either Staff OR Provider, not both.';
  if (msg.includes('violates not-null'))   return 'Please complete all required fields.';
  if (msg.includes('foreign key'))         return 'Referenced record no longer exists. Please reload.';
  if (msg.includes('permission'))          return 'You don\'t have permission for this action.';
  return 'Something went wrong. Please try again.';
}
