// panel/staff/js/staff-api.js
// Funciones de acceso a Supabase para el módulo de Staff.

import { supabase } from '../../../js/supabase-client.js';

// ─── CONSTANTES ──────────────────────────────────────

export const TIPOS_SERVICIO_SUGERIDOS = [
  'Deep Cleaning',
  'Regular Cleaning',
  'Move-In/Move-Out',
  'Post-Construction',
  'Laundry',
  'Organization',
  'Window Cleaning',
  'Carpet Cleaning',
  'Pressure Washing',
  'Concierge',
];

// ─── EMPLEADAS ───────────────────────────────────────

/**
 * Lista empleadas con filtros, búsqueda y paginación.
 * Join con usuarios para traer email y rol.
 * @returns {{ data, count, error }}
 */
export async function listarEmpleadas({
  busqueda = '', estado = 'all', tipo_contrato = 'all',
  pagina = 1, porPagina = 20
} = {}) {

  let query = supabase
    .from('empleadas')
    .select('*, usuarios!inner(id, email, rol, activo)', { count: 'exact' });

  if (busqueda) {
    const s = `%${busqueda}%`;
    query = query.or(
      `nombre.ilike.${s},apellido.ilike.${s},telefono.ilike.${s},notas.ilike.${s}`
    );
  }

  if (estado === 'active')   query = query.eq('activa', true);
  if (estado === 'inactive') query = query.eq('activa', false);
  if (tipo_contrato !== 'all') query = query.eq('tipo_contrato', tipo_contrato);

  query = query.order('apellido', { ascending: true });

  const desde = (pagina - 1) * porPagina;
  const hasta = desde + porPagina - 1;
  query = query.range(desde, hasta);

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
}

/**
 * Trae una empleada con join a usuarios.
 * @returns {{ empleada, error }}
 */
export async function obtenerEmpleada(id) {
  const { data, error } = await supabase
    .from('empleadas')
    .select('*, usuarios!inner(id, email, rol, activo)')
    .eq('id', id)
    .single();
  return { empleada: data, error };
}

/**
 * Crea empleada: signUp → wait → update usuarios → insert empleadas → send reset.
 * @returns {{ empleada, error }}
 */
export async function crearEmpleada(datos) {
  const { email, rol, nombre, apellido, telefono, tipo_contrato,
          fecha_inicio, tipos_servicio, notas } = datos;

  // 1. Crear cuenta de auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: crypto.randomUUID(), // temporal, se reemplaza con password reset
  });
  if (authError) return { empleada: null, error: authError };

  const authUserId = authData.user?.id;
  if (!authUserId) return { empleada: null, error: { message: 'Auth user creation failed.' } };

  // 2. Esperar trigger de DB (crea fila en usuarios)
  await new Promise(r => setTimeout(r, 500));

  // 3. Actualizar fila en usuarios (trigger la crea con valores por defecto)
  const { error: usuarioError } = await supabase
    .from('usuarios')
    .update({ rol, activo: true })
    .eq('auth_id', authUserId);
  if (usuarioError) return { empleada: null, error: usuarioError };

  // 4. Obtener el id interno del usuario
  const { data: usuarioRow, error: usuarioFetchError } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_id', authUserId)
    .single();
  if (usuarioFetchError) return { empleada: null, error: usuarioFetchError };

  // 5. Insertar en empleadas
  const { data: empleadaData, error: empleadaError } = await supabase
    .from('empleadas')
    .insert({
      usuario_id: usuarioRow.id,
      nombre,
      apellido,
      telefono: telefono || null,
      tipo_contrato: tipo_contrato || null,
      fecha_inicio: fecha_inicio || null,
      tipos_servicio: tipos_servicio || [],
      notas: notas || null,
      activa: true,
    })
    .select()
    .single();
  if (empleadaError) return { empleada: null, error: empleadaError };

  // 6. Enviar email de configuración de contraseña
  await supabase.auth.resetPasswordForEmail(email);

  return { empleada: empleadaData, error: null };
}

/**
 * Actualiza datos de una empleada (no cambia email ni auth).
 * @returns {{ empleada, error }}
 */
export async function actualizarEmpleada(id, datos) {
  const { nombre, apellido, telefono, tipo_contrato,
          fecha_inicio, tipos_servicio, notas, rol } = datos;

  // Actualizar tabla empleadas
  const { data, error } = await supabase
    .from('empleadas')
    .update({
      nombre,
      apellido,
      telefono: telefono || null,
      tipo_contrato: tipo_contrato || null,
      fecha_inicio: fecha_inicio || null,
      tipos_servicio: tipos_servicio || [],
      notas: notas || null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return { empleada: null, error };

  // Actualizar rol en usuarios si se proporcionó
  if (rol) {
    const { error: rolError } = await supabase
      .from('usuarios')
      .update({ rol })
      .eq('id', data.usuario_id);
    if (rolError) return { empleada: data, error: rolError };
  }

  return { empleada: data, error: null };
}

/**
 * Cambia estado activa/inactiva (soft delete).
 * También actualiza activo en usuarios.
 * @returns {{ error }}
 */
export async function toggleEmpleadaActiva(id, activa) {
  const { data: emp, error: fetchError } = await supabase
    .from('empleadas')
    .select('usuario_id')
    .eq('id', id)
    .single();
  if (fetchError) return { error: fetchError };

  const { error: empError } = await supabase
    .from('empleadas').update({ activa }).eq('id', id);
  if (empError) return { error: empError };

  const { error: usrError } = await supabase
    .from('usuarios').update({ activo: activa }).eq('id', emp.usuario_id);
  return { error: usrError };
}

/**
 * Reenvía email de configuración de contraseña.
 * @returns {{ error }}
 */
export async function reenviarPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
}

// ─── HELPERS ─────────────────────────────────────────

/**
 * Traduce errores de Supabase a mensajes legibles.
 */
export function traducirError(error) {
  if (!error) return null;
  const msg = error.message || error.toString();
  if (msg.includes('User already registered')) return 'An account with this email already exists.';
  if (msg.includes('duplicate key'))           return 'A staff member with this information already exists.';
  if (msg.includes('violates not-null'))        return 'Please complete all required fields.';
  if (msg.includes('permission'))              return 'You don\'t have permission for this action.';
  if (msg.includes('invalid email'))           return 'Invalid email address.';
  return 'Something went wrong. Please try again.';
}

/**
 * Formatea nombre completo de empleada.
 */
export function formatearNombreEmpleada(emp) {
  if (!emp) return '—';
  return `${emp.nombre} ${emp.apellido}`.trim();
}
