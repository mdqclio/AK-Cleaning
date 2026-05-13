// panel/properties/js/properties-api.js
// Funciones de acceso a Supabase para propiedades y edificios.

import { supabase } from '../../../js/supabase-client.js';

// ─── PROPIEDADES ─────────────────────────────────────

/**
 * Lista propiedades con filtros, búsqueda extendida y paginación.
 * La búsqueda cruza clientes y edificios para encontrar por nombre.
 * @returns {{ data, count, error }}
 */
export async function listarPropiedades({
  busqueda = '', cliente_id = 'all', edificio_id = 'all',
  tipo = 'all', estado = 'all', pagina = 1, porPagina = 20
} = {}) {

  // Buscar clientes que matcheen el término de búsqueda
  let idsPorCliente = [];
  if (busqueda) {
    const s = `%${busqueda}%`;
    const { data: clientesMatch } = await supabase
      .from('clientes')
      .select('id')
      .or(`nombre.ilike.${s},apellido.ilike.${s},razon_social.ilike.${s}`);
    if (clientesMatch) idsPorCliente = clientesMatch.map(c => c.id);
  }

  // Buscar edificios que matcheen el término de búsqueda
  let idsPorEdificio = [];
  if (busqueda) {
    const s = `%${busqueda}%`;
    const { data: edifMatch } = await supabase
      .from('edificios')
      .select('id')
      .ilike('nombre', s);
    if (edifMatch) idsPorEdificio = edifMatch.map(e => e.id);
  }

  let query = supabase
    .from('propiedades')
    .select('*, clientes(id, nombre, apellido, razon_social), edificios(id, nombre)', { count: 'exact' });

  if (busqueda) {
    const s = `%${busqueda}%`;
    const orParts = [
      `nombre_referencia.ilike.${s}`,
      `direccion_1.ilike.${s}`,
      `unidad.ilike.${s}`
    ];
    if (idsPorCliente.length) {
      const ids = idsPorCliente.map(id => `"${id}"`).join(',');
      orParts.push(`cliente_id.in.(${ids})`);
    }
    if (idsPorEdificio.length) {
      const ids = idsPorEdificio.map(id => `"${id}"`).join(',');
      orParts.push(`edificio_id.in.(${ids})`);
    }
    query = query.or(orParts.join(','));
  }

  if (cliente_id !== 'all')  query = query.eq('cliente_id', cliente_id);
  if (edificio_id !== 'all') {
    if (edificio_id === 'none') {
      query = query.is('edificio_id', null);
    } else {
      query = query.eq('edificio_id', edificio_id);
    }
  }
  if (tipo !== 'all')        query = query.eq('tipo', tipo);
  if (estado === 'active')   query = query.eq('activa', true);
  if (estado === 'inactive') query = query.eq('activa', false);

  query = query.order('nombre_referencia');

  const desde = (pagina - 1) * porPagina;
  const hasta = desde + porPagina - 1;
  query = query.range(desde, hasta);

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
}

/**
 * Trae una propiedad con joins a clientes y edificios.
 * @returns {{ propiedad, error }}
 */
export async function obtenerPropiedad(id) {
  const { data, error } = await supabase
    .from('propiedades')
    .select('*, clientes(id, nombre, apellido, razon_social), edificios(*)')
    .eq('id', id)
    .single();
  return { propiedad: data, error };
}

/**
 * Crea una propiedad nueva.
 * @returns {{ propiedad, error }}
 */
export async function crearPropiedad(datos) {
  const { data, error } = await supabase
    .from('propiedades')
    .insert({ ...datos })
    .select()
    .single();
  return { propiedad: data, error };
}

/**
 * Actualiza una propiedad existente.
 * @returns {{ propiedad, error }}
 */
export async function actualizarPropiedad(id, datos) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuarioActual } = await supabase
    .from('usuarios').select('id').eq('auth_id', user.id).single();

  const { data, error } = await supabase
    .from('propiedades')
    .update({ ...datos, actualizado_por: usuarioActual?.id })
    .eq('id', id)
    .select()
    .single();
  return { propiedad: data, error };
}

/**
 * Cambia estado activa/inactiva (soft delete).
 * @returns {{ error }}
 */
export async function togglePropiedadActiva(id, activa) {
  const { error } = await supabase
    .from('propiedades').update({ activa }).eq('id', id);
  return { error };
}

// ─── EDIFICIOS ───────────────────────────────────────

/**
 * Lista todos los edificios ordenados por nombre.
 * @returns {{ data, error }}
 */
export async function listarEdificios() {
  const { data, error } = await supabase
    .from('edificios').select('*').order('nombre');
  return { data: data || [], error };
}

/**
 * Lista edificios con conteo de propiedades asociadas.
 * @returns {{ data, error }}
 */
export async function listarEdificiosConConteo() {
  const { data: edificios, error } = await supabase
    .from('edificios')
    .select('*, propiedades(id)')
    .order('nombre');
  if (error) return { data: [], error };

  const enriquecidos = edificios.map(e => ({
    ...e,
    cantidad_propiedades: (e.propiedades || []).length
  }));
  return { data: enriquecidos, error: null };
}

/**
 * Crea un nuevo edificio.
 * @returns {{ edificio, error }}
 */
export async function crearEdificio(datos) {
  const { data, error } = await supabase
    .from('edificios').insert(datos).select().single();
  return { edificio: data, error };
}

/**
 * Actualiza un edificio existente.
 * @returns {{ edificio, error }}
 */
export async function actualizarEdificio(id, datos) {
  const { data, error } = await supabase
    .from('edificios').update(datos).eq('id', id).select().single();
  return { edificio: data, error };
}

/**
 * Elimina un edificio. Falla si tiene propiedades asociadas.
 * @returns {{ error }}
 */
export async function eliminarEdificio(id) {
  const { count } = await supabase
    .from('propiedades')
    .select('id', { count: 'exact', head: true })
    .eq('edificio_id', id);
  if (count > 0) {
    return { error: { message: `Cannot delete: ${count} property(ies) use this building.` } };
  }
  const { error } = await supabase.from('edificios').delete().eq('id', id);
  return { error };
}

// ─── CLIENTES (para dropdown) ────────────────────────

/**
 * Lista clientes activos para el dropdown del form de propiedades.
 * @returns {{ data, error }}
 */
export async function listarClientesParaDropdown() {
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, apellido, razon_social')
    .eq('activo', true)
    .order('apellido');
  return { data: data || [], error };
}

// ─── HELPERS ─────────────────────────────────────────

/**
 * Traduce errores de Supabase a mensajes legibles.
 */
export function traducirError(error) {
  if (!error) return null;
  const msg = error.message || error.toString();
  if (msg.includes('Cannot delete'))       return msg;
  if (msg.includes('check constraint'))    return 'Property must have either a building OR a manual address, not both.';
  if (msg.includes('duplicate key'))       return 'A property with this information already exists.';
  if (msg.includes('violates not-null'))   return 'Please complete all required fields.';
  if (msg.includes('permission'))          return 'You don\'t have permission for this action.';
  return 'Something went wrong. Please try again.';
}

/**
 * Formatea la dirección de una propiedad para mostrar en el listado.
 * Si tiene edificio, muestra "Nombre del edificio · Unit X".
 * Si es standalone, muestra la dirección manual.
 */
export function formatearDireccion(prop) {
  if (prop.edificios) {
    return `${prop.edificios.nombre}${prop.unidad ? ` · Unit ${prop.unidad}` : ''}`;
  }
  if (prop.direccion_1) {
    const partes = [prop.direccion_1];
    if (prop.ciudad) partes.push(prop.ciudad);
    if (prop.state)  partes.push(prop.state);
    return partes.join(', ');
  }
  return '—';
}

/**
 * Formatea el nombre de un cliente para mostrar en tabla y dropdown.
 */
export function formatearNombreCliente(cliente) {
  if (!cliente) return '—';
  const nombre = `${cliente.nombre} ${cliente.apellido}`;
  return cliente.razon_social ? `${cliente.razon_social} (${nombre})` : nombre;
}
