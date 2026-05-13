// panel/clients/js/clients-api.js
// Funciones de acceso a Supabase para el módulo de Clients.

import { supabase } from '../../../js/supabase-client.js';

/**
 * Lista clientes con filtros y paginación.
 * @returns {{ data, count, error }}
 */
export async function listarClientes({ busqueda = '', estado = 'all', tipo = 'all', pagina = 1, porPagina = 20 } = {}) {
  // Si hay búsqueda, buscar IDs de clientes que matcheen en cliente_contactos
  let idsPorContacto = [];
  if (busqueda) {
    const s = `%${busqueda}%`;
    const { data: contactosMatch } = await supabase
      .from('cliente_contactos')
      .select('cliente_id')
      .or(`nombre.ilike.${s},email.ilike.${s},telefono.ilike.${s},rol.ilike.${s}`);
    if (contactosMatch) {
      idsPorContacto = [...new Set(contactosMatch.map(c => c.cliente_id))];
    }
  }

  let query = supabase
    .from('clientes')
    .select('*', { count: 'exact' });

  if (busqueda) {
    const s = `%${busqueda}%`;
    // Buscar en campos del cliente O que el ID esté en idsPorContacto
    if (idsPorContacto.length > 0) {
      const idsList = idsPorContacto.map(id => `"${id}"`).join(',');
      query = query.or(
        `nombre.ilike.${s},apellido.ilike.${s},email.ilike.${s},telefono.ilike.${s},razon_social.ilike.${s},id.in.(${idsList})`
      );
    } else {
      query = query.or(
        `nombre.ilike.${s},apellido.ilike.${s},email.ilike.${s},telefono.ilike.${s},razon_social.ilike.${s}`
      );
    }
  }

  if (estado === 'active')   query = query.eq('activo', true);
  if (estado === 'inactive') query = query.eq('activo', false);
  if (tipo !== 'all')        query = query.eq('tipo', tipo);

  query = query.order('apellido', { ascending: true });

  const desde = (pagina - 1) * porPagina;
  const hasta = desde + porPagina - 1;
  query = query.range(desde, hasta);

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
}

/**
 * Cuenta propiedades activas por cliente (para mostrar en el listado).
 * @param {string[]} clienteIds
 * @returns {Record<string, number>}
 */
export async function contarPropiedadesPorCliente(clienteIds) {
  if (!clienteIds.length) return {};
  const { data, error } = await supabase
    .from('propiedades')
    .select('cliente_id')
    .in('cliente_id', clienteIds)
    .eq('activa', true);
  if (error) return {};
  const conteos = {};
  for (const p of data) conteos[p.cliente_id] = (conteos[p.cliente_id] || 0) + 1;
  return conteos;
}

/**
 * Trae un cliente junto con sus contactos.
 * @returns {{ cliente, contactos, error }}
 */
export async function obtenerCliente(id) {
  const { data: cliente, error } = await supabase
    .from('clientes').select('*').eq('id', id).single();
  if (error) return { cliente: null, contactos: [], error };

  const { data: contactos } = await supabase
    .from('cliente_contactos')
    .select('*')
    .eq('cliente_id', id)
    .order('es_principal', { ascending: false });

  return { cliente, contactos: contactos || [], error: null };
}

/**
 * Crea un nuevo cliente. Devuelve { cliente, error }.
 */
export async function crearCliente(datos) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuarioActual } = await supabase
    .from('usuarios').select('id').eq('auth_id', user.id).single();

  const { data, error } = await supabase
    .from('clientes')
    .insert({ ...datos, creado_por: usuarioActual?.id })
    .select()
    .single();
  return { cliente: data, error };
}

/**
 * Actualiza un cliente existente.
 * @returns {{ cliente, error }}
 */
export async function actualizarCliente(id, datos) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: usuarioActual } = await supabase
    .from('usuarios').select('id').eq('auth_id', user.id).single();

  const { data, error } = await supabase
    .from('clientes')
    .update({ ...datos, actualizado_por: usuarioActual?.id })
    .eq('id', id)
    .select()
    .single();
  return { cliente: data, error };
}

/**
 * Cambia estado activo/inactivo (soft delete).
 * @returns {{ error }}
 */
export async function toggleActivo(id, activo) {
  const { error } = await supabase
    .from('clientes').update({ activo }).eq('id', id);
  return { error };
}

/**
 * Reemplaza los contactos de un cliente (delete all + insert new).
 * Válido para volúmenes chicos (1-5 contactos por cliente).
 * @returns {{ error }}
 */
export async function guardarContactos(cliente_id, contactos) {
  await supabase.from('cliente_contactos').delete().eq('cliente_id', cliente_id);
  if (!contactos.length) return { error: null };

  const filas = contactos.map(c => ({ ...c, cliente_id }));
  const { error } = await supabase.from('cliente_contactos').insert(filas);
  return { error };
}

/**
 * Trae las propiedades activas de un cliente (lectura para el detalle).
 * @returns {{ propiedades, error }}
 */
export async function propiedadesDelCliente(cliente_id) {
  const { data, error } = await supabase
    .from('propiedades')
    .select('id, nombre_referencia, tipo, activa')
    .eq('cliente_id', cliente_id)
    .eq('activa', true)
    .order('nombre_referencia');
  return { propiedades: data || [], error };
}

/**
 * Traduce errores de Supabase a mensajes legibles para el usuario.
 * @param {object|null} error
 * @returns {string|null}
 */
export function traducirError(error) {
  if (!error) return null;
  const msg = error.message || error.toString();
  if (msg.includes('duplicate key'))      return 'A client with this information already exists.';
  if (msg.includes('violates not-null'))  return 'Please complete all required fields.';
  if (msg.includes('permission'))         return 'You don\'t have permission for this action.';
  return 'Something went wrong. Please try again.';
}
