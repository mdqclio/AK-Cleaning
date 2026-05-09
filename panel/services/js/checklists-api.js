// panel/services/js/checklists-api.js
// CRUD de plantillas de checklist y sus items.

import { supabase } from '/js/supabase-client.js';

// ─── PLANTILLAS ──────────────────────────────────────

export async function listarPlantillas({ busqueda = '', idioma = 'all', servicio_id = 'all', estado = 'all' } = {}) {
  let query = supabase
    .from('plantillas_checklist')
    .select(`
      *,
      servicios(id, nombre_en, nombre_es),
      plantilla_items(id)
    `)
    .order('nombre');

  if (busqueda) {
    const s = `%${busqueda}%`;
    query = query.ilike('nombre', s);
  }
  if (idioma !== 'all') query = query.eq('idioma', idioma);
  if (servicio_id !== 'all') {
    if (servicio_id === 'none') {
      query = query.is('servicio_id', null);
    } else {
      query = query.eq('servicio_id', servicio_id);
    }
  }
  if (estado === 'active')   query = query.eq('activa', true);
  if (estado === 'inactive') query = query.eq('activa', false);

  const { data, error } = await query;

  const enriquecidas = (data || []).map(p => ({
    ...p,
    cantidad_items: (p.plantilla_items || []).length
  }));

  return { data: enriquecidas, error };
}

export async function obtenerPlantilla(id) {
  const { data, error } = await supabase
    .from('plantillas_checklist')
    .select(`
      *,
      servicios(id, nombre_en, nombre_es),
      plantilla_items(*)
    `)
    .eq('id', id)
    .single();

  if (data?.plantilla_items) {
    data.plantilla_items.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }

  return { plantilla: data, error };
}

export async function crearPlantilla(datos) {
  const { data, error } = await supabase
    .from('plantillas_checklist')
    .insert(datos)
    .select()
    .single();
  return { plantilla: data, error };
}

export async function actualizarPlantilla(id, datos) {
  const { data, error } = await supabase
    .from('plantillas_checklist')
    .update(datos)
    .eq('id', id)
    .select()
    .single();
  return { plantilla: data, error };
}

export async function togglePlantillaActiva(id, activa) {
  const { error } = await supabase
    .from('plantillas_checklist')
    .update({ activa })
    .eq('id', id);
  return { error };
}

// ─── ITEMS DE PLANTILLA ──────────────────────────────

export async function guardarItemsPlantilla(plantilla_id, items) {
  // Borrar items actuales y recrear (más simple que diff)
  await supabase
    .from('plantilla_items')
    .delete()
    .eq('plantilla_id', plantilla_id);

  if (items.length === 0) return { error: null };

  const filas = items.map((it, idx) => ({
    plantilla_id,
    descripcion: it.descripcion,
    orden: idx + 1,
    obligatorio: !!it.obligatorio
  }));

  const { error } = await supabase
    .from('plantilla_items')
    .insert(filas);

  return { error };
}

// ─── DROPDOWNS ───────────────────────────────────────

export async function listarServiciosParaSelect() {
  const { data, error } = await supabase
    .from('servicios')
    .select('id, nombre_en, nombre_es')
    .eq('activo', true)
    .order('nombre_en');
  return { data: data || [], error };
}

// ─── ERROR HELPER ────────────────────────────────────

export function traducirError(error) {
  if (!error) return null;
  const msg = error.message || error.toString();
  if (msg.includes('violates not-null')) return 'Please complete all required fields.';
  if (msg.includes('duplicate'))         return 'A template with this name already exists.';
  if (msg.includes('foreign key'))       return 'Referenced record no longer exists. Please reload.';
  if (msg.includes('permission'))        return 'You don\'t have permission for this action.';
  return 'Something went wrong. Please try again.';
}
