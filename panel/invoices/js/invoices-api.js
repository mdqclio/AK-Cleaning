// panel/invoices/js/invoices-api.js
// Funciones de acceso a Supabase para el módulo de Invoices.

import { supabase } from '../../../js/supabase-client.js';

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
      id, numero, fecha, descripcion_general, subtotal, total_due, estado, notas, version,
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

// ─── GENERAR FINAL (Etapa 2) ─────────────────────────

/**
 * Trae un cliente con sus campos bill_to para el snapshot.
 */
export async function obtenerClienteParaFactura(cliente_id) {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, apellido, razon_social, email, bill_to_name, bill_to_email, bill_to_address_1, bill_to_address_2, bill_to_city, bill_to_state, bill_to_zip')
    .eq('id', cliente_id)
    .single();
  return { cliente: data, error };
}

/**
 * Asigna número correlativo y cambia estado a 'generada'.
 * Hace version check ANTES de consumir un número.
 * Si el UPDATE falla, devuelve el número con devolver_numero_factura().
 * Bill To ya está persistido en la factura — no se necesita snapshot.
 * @returns {{ numero, error }}
 */
export async function generarNumero(id, version) {
  const { data: actual } = await supabase
    .from('facturas').select('version').eq('id', id).single();

  if (actual?.version !== version) {
    return { error: { message: 'This invoice was modified by someone else. Please reload and try again.' }, numero: null };
  }

  const { data: nro, error: errNro } = await supabase.rpc('siguiente_numero_factura');
  if (errNro || nro == null) {
    return { error: errNro || { message: 'Could not assign invoice number. Please try again.' }, numero: null };
  }

  const { error: errUpdate } = await supabase
    .from('facturas')
    .update({ numero: nro, estado: 'generada' })
    .eq('id', id);

  if (errUpdate) {
    await supabase.rpc('devolver_numero_factura', { p_numero: nro });
    return { error: errUpdate, numero: null };
  }

  return { numero: nro, error: null };
}

/**
 * Sube un PDF blob a Storage: facturas/{año}/{numero}.pdf
 * @returns {{ publicUrl, error }}
 */
export async function subirPDF(numero, año, blob) {
  const path = `${año}/${numero}.pdf`;
  const { error: errUpload } = await supabase.storage
    .from('facturas')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });

  if (errUpload) return { publicUrl: null, error: errUpload };

  const { data: { publicUrl } } = supabase.storage
    .from('facturas')
    .getPublicUrl(path);

  return { publicUrl, error: null };
}

/** Actualiza pdf_url en la factura después del upload. */
export async function actualizarPdfUrl(id, pdf_url) {
  const { error } = await supabase.from('facturas').update({ pdf_url }).eq('id', id);
  return { error };
}

/** Rollback: devuelve el número al counter si el proceso falló post-numeración. */
export async function devolverNumero(numero) {
  await supabase.rpc('devolver_numero_factura', { p_numero: numero });
}

/** Rollback: revierte estado a 'borrador' y borra el numero asignado. */
export async function revertirABorrador(id) {
  await supabase.from('facturas').update({ estado: 'borrador', numero: null }).eq('id', id);
}

/**
 * Cambia estado a 'anulada'. Solo permite estado='generada'.
 * El número queda registrado como hueco (no se devuelve al counter).
 */
export async function anularFactura(id, version) {
  const { data: actual } = await supabase
    .from('facturas').select('version, estado').eq('id', id).single();

  if (!actual) return { error: { message: 'Invoice not found.' } };
  if (actual.version !== version) {
    return { error: { message: 'This invoice was modified by someone else. Please reload and try again.' } };
  }
  if (actual.estado !== 'generada') {
    return { error: { message: 'Only generated invoices can be voided.' } };
  }

  const { error } = await supabase.from('facturas').update({ estado: 'anulada' }).eq('id', id);
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

/** Propiedades activas de un cliente para el dropdown del form. */
export async function listarPropiedadesCliente(cliente_id) {
  if (!cliente_id) return { data: [] };
  const { data, error } = await supabase
    .from('propiedades')
    .select('id, nombre_referencia, unidad')
    .eq('cliente_id', cliente_id)
    .eq('activa', true)
    .order('nombre_referencia');
  return { data: data || [], error };
}

// ─── PAYMENTS ────────────────────────────────────────

export const METODOS_PAGO = ['cash', 'check', 'transfer', 'zelle', 'venmo', 'credit_card', 'other'];

export async function listarPagos(facturaId) {
  const { data, error } = await supabase
    .from('factura_pagos')
    .select('*, creado_por_usuario:creado_por(nombre, apellido)')
    .eq('factura_id', facturaId)
    .order('fecha', { ascending: true })
    .order('creado_en', { ascending: true });
  return { data: data || [], error };
}

export async function crearPago({ factura_id, fecha, monto, metodo, referencia, notas }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuarioRow } = await supabase
    .from('usuarios').select('id').eq('auth_id', user.id).single();

  const { data, error } = await supabase
    .from('factura_pagos')
    .insert({
      factura_id,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      monto: Number(monto),
      metodo,
      referencia: referencia || null,
      notas: notas || null,
      creado_por: usuarioRow?.id || null,
    })
    .select()
    .single();

  if (!error) {
    await supabase.rpc('recalcular_estado_factura', { p_factura_id: factura_id });
  }
  return { data, error };
}

export async function eliminarPago(pagoId, facturaId) {
  const { error } = await supabase.from('factura_pagos').delete().eq('id', pagoId);
  if (!error) {
    await supabase.rpc('recalcular_estado_factura', { p_factura_id: facturaId });
  }
  return { error };
}

export async function obtenerResumenPagos(facturaId, totalFactura) {
  const { data, error } = await supabase
    .from('factura_pagos')
    .select('monto')
    .eq('factura_id', facturaId);
  if (error) return { resumen: null, error };
  const total_pagado = (data || []).reduce((acc, p) => acc + Number(p.monto), 0);
  const saldo = Number(totalFactura) - total_pagado;
  return {
    resumen: {
      total_factura: Number(totalFactura),
      total_pagado,
      saldo,
      cantidad_pagos: (data || []).length,
    },
    error: null,
  };
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
  if (msg.includes('Only generated invoices can be voided')) return msg;
  if (msg.includes('Could not assign invoice number')) return msg;
  if (msg.includes('violates not-null'))   return 'Please complete all required fields.';
  if (msg.includes('foreign key'))         return 'Referenced record no longer exists. Please reload.';
  if (msg.includes('permission'))          return 'You don\'t have permission for this action.';
  return 'Something went wrong. Please try again.';
}
