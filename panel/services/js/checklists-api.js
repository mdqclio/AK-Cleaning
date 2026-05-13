// panel/services/js/checklists-api.js
// CRUD de plantillas de checklist y sus items.

import { supabase } from '../../../js/supabase-client.js';

// ─── PLANTILLAS ──────────────────────────────────────

export async function listarPlantillas({ busqueda = '', idioma = 'all', servicio_id = 'all', estado = 'all' } = {}) {
  let query = supabase
    .from('plantillas_checklist')
    .select(`
      *,
      servicios!plantillas_checklist_servicio_id_fkey(id, nombre_en, nombre_es),
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
      servicios!plantillas_checklist_servicio_id_fkey(id, nombre_en, nombre_es),
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

// ─── CHECKLIST DE OS ─────────────────────────────────

/**
 * Lista los items del checklist de una OS específica, en orden.
 */
export async function listarChecklistOS(os_id) {
  const { data, error } = await supabase
    .from('os_checklist')
    .select('*')
    .eq('os_id', os_id)
    .order('orden');
  return { data: data || [], error };
}

/**
 * Lista las plantillas activas (para el dropdown del modal de OS).
 */
export async function listarPlantillasActivas() {
  const { data, error } = await supabase
    .from('plantillas_checklist')
    .select(`
      id, nombre, idioma, servicio_id,
      plantilla_items(id)
    `)
    .eq('activa', true)
    .order('nombre');

  const enriquecidas = (data || []).map(p => ({
    ...p,
    cantidad_items: (p.plantilla_items || []).length
  }));

  return { data: enriquecidas, error };
}

/**
 * Aplica una plantilla a una OS: copia los items de la plantilla.
 * Si reemplazar=true, borra el checklist actual antes.
 */
export async function aplicarPlantillaAOS(os_id, plantilla_id, reemplazar = true) {
  // Obtener items de la plantilla
  const { data: items, error: errItems } = await supabase
    .from('plantilla_items')
    .select('descripcion, orden, obligatorio')
    .eq('plantilla_id', plantilla_id)
    .order('orden');

  if (errItems) return { error: errItems, count: 0 };

  if (reemplazar) {
    await supabase.from('os_checklist').delete().eq('os_id', os_id);
  }

  if (!items || items.length === 0) return { error: null, count: 0 };

  const filas = items.map((it, idx) => ({
    os_id,
    descripcion: it.descripcion,
    orden: idx + 1,
    obligatorio: !!it.obligatorio,
    completado: false
  }));

  const { error } = await supabase
    .from('os_checklist')
    .insert(filas);

  return { error, count: filas.length };
}

/**
 * Agregar un item manual al checklist de OS (no viene de plantilla).
 */
export async function agregarItemManualOS(os_id, descripcion, obligatorio = false) {
  // Calcular siguiente orden
  const { data: actuales } = await supabase
    .from('os_checklist')
    .select('orden')
    .eq('os_id', os_id)
    .order('orden', { ascending: false })
    .limit(1);
  const orden = (actuales?.[0]?.orden || 0) + 1;

  const { data, error } = await supabase
    .from('os_checklist')
    .insert({
      os_id,
      descripcion,
      orden,
      obligatorio,
      completado: false
    })
    .select()
    .single();

  return { item: data, error };
}

/**
 * Borrar un item del checklist de OS.
 */
export async function eliminarItemChecklistOS(item_id) {
  const { error } = await supabase
    .from('os_checklist')
    .delete()
    .eq('id', item_id);
  return { error };
}

/**
 * Marca un item del checklist de OS como completado o no.
 */
export async function toggleItemChecklistOS(item_id, completado) {
  const { data: { user } } = await supabase.auth.getUser();
  let usuario_id = null;
  if (user) {
    const { data: u } = await supabase
      .from('usuarios').select('id').eq('auth_id', user.id).single();
    usuario_id = u?.id || null;
  }

  const updates = {
    completado,
    completado_en: completado ? new Date().toISOString() : null,
    completado_por: completado ? usuario_id : null
  };

  const { error } = await supabase
    .from('os_checklist')
    .update(updates)
    .eq('id', item_id);

  return { error };
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
