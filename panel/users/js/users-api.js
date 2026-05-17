// panel/users/js/users-api.js
// CRUD para usuarios del sistema (admin, owner, compras).
// Excluye: empleadas (módulo Staff), proveedores (módulo Providers), superadmin (solo SQL).

import { supabase } from '../../../js/supabase-client.js';

export const ROLES_GESTIONADOS = ['admin', 'owner', 'compras'];

// ─── LISTAR / OBTENER ────────────────────────────────

export async function listarUsuarios({
  busqueda = '', rol = 'all', estado = 'all',
  pagina = 1, porPagina = 20
} = {}) {
  let query = supabase
    .from('usuarios')
    .select('id, auth_id, email, nombre, apellido, telefono, rol, activo, creado_en', { count: 'exact' })
    .in('rol', ROLES_GESTIONADOS);

  if (busqueda) {
    const s = `%${busqueda}%`;
    query = query.or(`nombre.ilike.${s},apellido.ilike.${s},email.ilike.${s}`);
  }

  if (rol !== 'all')         query = query.eq('rol', rol);
  if (estado === 'active')   query = query.eq('activo', true);
  if (estado === 'inactive') query = query.eq('activo', false);

  query = query.order('apellido', { ascending: true });

  const desde = (pagina - 1) * porPagina;
  query = query.range(desde, desde + porPagina - 1);

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
}

export async function obtenerUsuario(id) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, auth_id, email, nombre, apellido, telefono, rol, activo')
    .eq('id', id)
    .single();
  return { usuario: data, error };
}

// ─── CREATE ──────────────────────────────────────────

export async function crearUsuario({ email, rol, nombre, apellido, telefono }) {
  // 1. Crear cuenta Auth (trigger fn_handle_new_user crea fila en usuarios)
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: crypto.randomUUID(),
  });
  if (authError) return { error: authError };

  const authUserId = authData.user?.id;
  if (!authUserId) return { error: { message: 'Auth user creation failed.' } };

  // 2. Esperar trigger
  await new Promise(r => setTimeout(r, 500));

  // 3. Update usuarios: datos personales + rol (trigger crea la fila con defaults)
  const { error: usrError } = await supabase
    .from('usuarios')
    .update({
      nombre,
      apellido,
      telefono: telefono || null,
      rol,
      activo: true,
    })
    .eq('auth_id', authUserId);
  if (usrError) return { error: usrError };

  // 4. Email de configuración de contraseña
  await supabase.auth.resetPasswordForEmail(email);

  return { error: null };
}

// ─── UPDATE ──────────────────────────────────────────

export async function actualizarUsuario(id, { nombre, apellido, telefono, rol }) {
  const payload = {};
  if (nombre   !== undefined) payload.nombre   = nombre;
  if (apellido !== undefined) payload.apellido = apellido;
  if (telefono !== undefined) payload.telefono = telefono || null;
  if (rol)                    payload.rol      = rol;

  const { error } = await supabase
    .from('usuarios')
    .update(payload)
    .eq('id', id);

  return { error };
}

// ─── TOGGLE ACTIVO ───────────────────────────────────

export async function toggleUsuarioActivo(id, activo) {
  const { error } = await supabase
    .from('usuarios')
    .update({ activo })
    .eq('id', id);
  return { error };
}

// ─── PASSWORD RESET ──────────────────────────────────

export async function reenviarPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
}

// ─── HELPERS ─────────────────────────────────────────

export function traducirError(error) {
  if (!error) return null;
  const msg = error.message || error.toString();
  if (msg.includes('User already registered'))            return 'An account with this email already exists.';
  if (msg.includes('duplicate key') ||
      msg.includes('usuarios_email_key'))                 return 'A user with this email already exists.';
  if (msg.includes('violates not-null'))                  return 'Please complete all required fields.';
  if (msg.includes('permission') || msg.includes('policy')) return "You don't have permission for this action.";
  if (msg.includes('invalid email'))                      return 'Invalid email address.';
  if (msg.includes('violates check constraint'))          return 'Invalid role selected.';
  return 'Something went wrong. Please try again.';
}
