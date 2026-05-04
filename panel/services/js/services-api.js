// panel/services/js/services-api.js
// Funciones de acceso a Supabase para el catálogo de servicios.

import { supabase } from '/js/supabase-client.js';

// ─── CONSTANTES ──────────────────────────────────────

export const CATEGORIAS = [
  { value: 'limpieza',      label: 'Cleaning' },
  { value: 'mantenimiento', label: 'Maintenance' },
  { value: 'mudanza',       label: 'Moving' },
  { value: 'eventos',       label: 'Events' },
  { value: 'pet_care',      label: 'Pet Care' },
  { value: 'compras',       label: 'Shopping & Errands' },
  { value: 'emergencia',    label: 'Emergency' },
  { value: 'inspeccion',    label: 'Inspection' },
  { value: 'otro',          label: 'Other' }
];

export const UNIDADES = [
  { value: 'flat',  label: 'Flat fee' },
  { value: 'hour',  label: 'Per hour' },
  { value: 'visit', label: 'Per visit' },
  { value: 'sqft',  label: 'Per square foot' }
];

// ─── LISTADO ─────────────────────────────────────────

export async function listarServicios({ busqueda = '', categoria = 'all', estado = 'all' } = {}) {
  let query = supabase
    .from('servicios')
    .select(`
      *,
      servicio_tarifas(id, precio, unidad, vigente_desde, vigente_hasta, notas)
    `)
    .order('categoria')
    .order('nombre_en');

  if (busqueda) {
    const s = `%${busqueda}%`;
    query = query.or(`nombre_es.ilike.${s},nombre_en.ilike.${s}`);
  }

  if (categoria !== 'all') query = query.eq('categoria', categoria);
  if (estado === 'active')   query = query.eq('activo', true);
  if (estado === 'inactive') query = query.eq('activo', false);

  const { data, error } = await query;

  // Calcular tarifa vigente para cada servicio
  const hoy = new Date().toISOString().split('T')[0];
  const enriquecidos = (data || []).map(s => {
    const tarifaVigente = (s.servicio_tarifas || []).find(t =>
      t.vigente_desde <= hoy && (!t.vigente_hasta || t.vigente_hasta >= hoy)
    );
    return { ...s, tarifa_vigente: tarifaVigente || null };
  });

  return { data: enriquecidos, error };
}

// ─── DETALLE ─────────────────────────────────────────

export async function obtenerServicio(id) {
  const { data, error } = await supabase
    .from('servicios')
    .select('*, servicio_tarifas(*)')
    .eq('id', id)
    .single();
  return { servicio: data, error };
}

// ─── CREAR / ACTUALIZAR ──────────────────────────────

export async function crearServicio(datos) {
  const { data, error } = await supabase
    .from('servicios').insert(datos).select().single();
  return { servicio: data, error };
}

export async function actualizarServicio(id, datos) {
  const { data, error } = await supabase
    .from('servicios').update(datos).eq('id', id).select().single();
  return { servicio: data, error };
}

export async function toggleServicioActivo(id, activo) {
  const { error } = await supabase
    .from('servicios').update({ activo }).eq('id', id);
  return { error };
}

// ─── TARIFAS ─────────────────────────────────────────

/**
 * Crea una nueva tarifa. Cierra la tarifa vigente anterior (vigente_hasta = ayer).
 * @returns {{ tarifa, error }}
 */
export async function crearTarifa(servicio_id, datos) {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const ayerStr = ayer.toISOString().split('T')[0];

  // Cerrar tarifa anterior sin fecha fin
  await supabase
    .from('servicio_tarifas')
    .update({ vigente_hasta: ayerStr })
    .eq('servicio_id', servicio_id)
    .is('vigente_hasta', null);

  const { data, error } = await supabase
    .from('servicio_tarifas')
    .insert({ ...datos, servicio_id })
    .select()
    .single();

  return { tarifa: data, error };
}

export async function eliminarTarifa(id) {
  const { error } = await supabase
    .from('servicio_tarifas').delete().eq('id', id);
  return { error };
}

// ─── HELPERS ─────────────────────────────────────────

export function formatearPrecio(tarifa) {
  if (!tarifa) return '—';
  const sufijos = { flat: '', hour: '/hr', visit: '/visit', sqft: '/sqft' };
  return `$${Number(tarifa.precio).toFixed(2)}${sufijos[tarifa.unidad] || ''}`;
}

export function categoriaLabel(cat) {
  return CATEGORIAS.find(c => c.value === cat)?.label || cat || '—';
}

export function traducirError(error) {
  if (!error) return null;
  const msg = error.message || error.toString();
  if (msg.includes('duplicate'))         return 'A service with this name already exists.';
  if (msg.includes('violates not-null')) return 'Please complete all required fields.';
  if (msg.includes('numeric'))           return 'Price must be a valid number.';
  return 'Something went wrong. Please try again.';
}
