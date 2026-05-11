// panel/invoices/js/invoices-api.js
// Funciones de acceso a Supabase para el módulo de Invoices.

import { supabase } from '/js/supabase-client.js';

// ─── LISTADO ─────────────────────────────────────────

/**
 * Lista facturas con filtros y paginación.
 * @returns {{ data, count, error }}
 */
export async function listarFacturas({
  busqueda = '',
  estado = 'all',
  cliente_id = 'all',
  pagina = 1,
  porPagina = 20
} = {}) {

  let query = supabase
    .from('facturas')
    .select(`
      id, numero, fecha, descripcion_general, subtotal, total_due, estado, notas,
      creado_en,
      clientes(id, nombre, apellido, razon_social)
    `, { count: 'exact' });

  if (estado !== 'all') query = query.eq('estado', estado);
  if (cliente_id !== 'all') query = query.eq('cliente_id', cliente_id);

  if (busqueda) {
    const s = `%${busqueda}%`;
    query = query.or(`descripcion_general.ilike.${s},notas.ilike.${s}`);
  }

  query = query.order('creado_en', { ascending: false });

  const desde = (pagina - 1) * porPagina;
  const hasta = desde + porPagina - 1;
  query = query.range(desde, hasta);

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
}

// ─── DETALLE ─────────────────────────────────────────

/**
 * Trae una factura completa con sus líneas y cliente.
 * @returns {{ factura, error }}
 */
export async function obtenerFactura(id) {
  const { data, error } = await supabase
    .from('facturas')
    .select(`
      *,
      clientes(id, nombre, apellido, razon_social),
      factura_lineas(*)
    `)
    .eq('id', id)
    .single();

  if (data?.factura_lineas) {
    data.factura_lineas.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }

  return { factura: data, error };
}

// ─── CREAR ───────────────────────────────────────────

/**
 * Crea una factura en estado 'borrador' con sus líneas.
 * @returns {{ factura, error }}
 */
export async function crearFactura(datosFactura, lineas) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuarioActual } = await supabase
    .from('usuarios').select('id').eq('auth_id', user.id).single();

  const { data: factura, error: errF } = await supabase
    .from('facturas')
    .insert({ ...datosFactura, estado: 'borrador', creado_por: usuarioActual?.id })
    .select()
    .single();

  if (errF) return { factura: null, error: errF };

  if (lineas.length > 0) {
    const filas = lineas.map((l, idx) => ({
      ...l,
      factura_id: factura.id,
      orden: idx + 1
    }));
    const { error: errL } = await supabase.from('factura_lineas').insert(filas);
    if (errL) return { factura, error: errL };
  }

  return { factura, error: null };
}

// ─── ACTUALIZAR ──────────────────────────────────────

/**
 * Actualiza una factura y reemplaza sus líneas.
 * Incluye optimistic locking por version.
 * @returns {{ error }}
 */
export async function actualizarFactura(id, datosFactura, lineas, version) {
  // Optimistic locking
  const { data: actual } = await supabase
    .from('facturas').select('version').eq('id', id).single();
  if (actual?.version !== version) {
    return { error: { message: 'This invoice was modified by someone else. Please reload and try again.' } };
  }

  const { error: errF } = await supabase
    .from('facturas')
    .update(datosFactura)
    .eq('id', id);

  if (errF) return { error: errF };

  // Reemplazar líneas
  await supabase.from('factura_lineas').delete().eq('factura_id', id);

  if (lineas.length > 0) {
    const filas = lineas.map((l, idx) => ({
      ...l,
      factura_id: id,
      orden: idx + 1
    }));
    const { error: errL } = await supabase.from('factura_lineas').insert(filas);
    if (errL) return { error: errL };
  }

  return { error: null };
}

// ─── ELIMINAR ────────────────────────────────────────

/**
 * Elimina una factura en estado 'borrador'. Las líneas se eliminan por CASCADE.
 * @returns {{ error }}
 */
export async function eliminarFactura(id) {
  // Verificar que sea borrador antes de eliminar
  const { data: factura } = await supabase
    .from('facturas').select('estado').eq('id', id).single();

  if (!factura || factura.estado !== 'borrador') {
    return { error: { message: 'Only draft invoices can be deleted.' } };
  }

  const { error } = await supabase.from('facturas').delete().eq('id', id);
  return { error };
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

// ─── ERROR HELPER ────────────────────────────────────

export function traducirError(error) {
  if (!error) return null;
  const msg = error.message || error.toString();
  if (msg.includes('modified by someone else')) return msg;
  if (msg.includes('Cannot modify critical fields on a sent/paid invoice')) {
    return 'This invoice has been sent. To make corrections, issue a credit note.';
  }
  if (msg.includes('Only draft invoices can be deleted')) return msg;
  if (msg.includes('violates not-null'))   return 'Please complete all required fields.';
  if (msg.includes('foreign key'))         return 'Referenced record no longer exists. Please reload.';
  if (msg.includes('permission'))          return 'You don\'t have permission for this action.';
  return 'Something went wrong. Please try again.';
}
