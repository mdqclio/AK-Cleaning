// panel/staff/js/staff-api.js
// Funciones de acceso a Supabase para el módulo de Staff.
// Datos personales (nombre/apellido/telefono/activo) viven en `usuarios`.
// Datos del rol (tipo_contrato/tipos_servicio/fecha_inicio/notas/tarifa_hora/disponibilidad/docs) en `empleadas`.

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

const SELECT_EMPLEADA = `
  id, usuario_id, tipo_contrato, fecha_inicio, tipos_servicio, notas,
  tarifa_hora, disponibilidad, doc_seguro_url, doc_id_url, creado_en,
  usuarios!inner(id, auth_id, email, telefono, rol, activo, nombre, apellido)
`;

// ─── LISTAR / OBTENER ────────────────────────────────

export async function listarEmpleadas({
  busqueda = '', estado = 'all', tipo_contrato = 'all',
  pagina = 1, porPagina = 20
} = {}) {

  let query = supabase
    .from('empleadas')
    .select(SELECT_EMPLEADA, { count: 'exact' });

  if (busqueda) {
    const s = `%${busqueda}%`;
    query = query.or(
      `nombre.ilike.${s},apellido.ilike.${s},telefono.ilike.${s},email.ilike.${s}`,
      { foreignTable: 'usuarios' }
    );
  }

  if (estado === 'active')   query = query.eq('usuarios.activo', true);
  if (estado === 'inactive') query = query.eq('usuarios.activo', false);
  if (tipo_contrato !== 'all') query = query.eq('tipo_contrato', tipo_contrato);

  query = query.order('apellido', { foreignTable: 'usuarios', ascending: true });

  const desde = (pagina - 1) * porPagina;
  const hasta = desde + porPagina - 1;
  query = query.range(desde, hasta);

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
}

export async function obtenerEmpleada(id) {
  const { data, error } = await supabase
    .from('empleadas')
    .select(SELECT_EMPLEADA)
    .eq('id', id)
    .single();
  return { empleada: data, error };
}

// ─── CREATE ──────────────────────────────────────────

export async function crearEmpleada(datos) {
  const {
    email, rol, nombre, apellido, telefono,
    tipo_contrato, fecha_inicio, tipos_servicio, notas, tarifa_hora,
  } = datos;

  // Guardar sesión actual — signUp reemplaza la sesión con la del nuevo user
  const { data: { session: sessionAntes } } = await supabase.auth.getSession();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: crypto.randomUUID(),
  });
  if (authError) return { empleada: null, error: authError };

  const authUserId = authData.user?.id;
  if (!authUserId) return { empleada: null, error: { message: 'Auth user creation failed.' } };

  // Detectar signUp silencioso: cuando Supabase Auth rechaza el signup
  // (email duplicado, signups disabled, dominio bloqueado) NO devuelve authError
  // pero el array identities viene vacío.
  if (!authData.user?.identities || authData.user.identities.length === 0) {
    if (sessionAntes) await supabase.auth.setSession({ access_token: sessionAntes.access_token, refresh_token: sessionAntes.refresh_token });
    return { empleada: null, error: { message: 'Email already registered or signup rejected. Try a different email.' } };
  }

  await new Promise(r => setTimeout(r, 1500));

  // RPC SECURITY DEFINER: bypasa RLS (el signUp dejó la sesión como el nuevo user)
  const { data: usuarioRow, error: rpcError } = await supabase
    .rpc('actualizar_perfil_post_signup', {
      p_auth_id:  authUserId,
      p_nombre:   nombre,
      p_apellido: apellido,
      p_telefono: telefono || null,
      p_rol:      rol,
    });
  if (rpcError) {
    if (sessionAntes) await supabase.auth.setSession({ access_token: sessionAntes.access_token, refresh_token: sessionAntes.refresh_token });
    return { empleada: null, error: rpcError };
  }
  if (!usuarioRow) {
    if (sessionAntes) await supabase.auth.setSession({ access_token: sessionAntes.access_token, refresh_token: sessionAntes.refresh_token });
    return { empleada: null, error: { message: 'RPC returned no row for auth_id=' + authUserId } };
  }

  const { data: empleadaData, error: empleadaError } = await supabase
    .from('empleadas')
    .insert({
      usuario_id:     usuarioRow.id,
      tipo_contrato:  tipo_contrato || null,
      fecha_inicio:   fecha_inicio || null,
      tipos_servicio: tipos_servicio || [],
      notas:          notas || null,
      tarifa_hora:    tarifa_hora ?? null,
    })
    .select()
    .single();

  // Restaurar sesión original antes de retornar (éxito o error)
  if (sessionAntes) await supabase.auth.setSession({ access_token: sessionAntes.access_token, refresh_token: sessionAntes.refresh_token });

  if (empleadaError) return { empleada: null, error: empleadaError };

  await supabase.auth.resetPasswordForEmail(email);

  return { empleada: empleadaData, error: null };
}

// ─── UPDATE ──────────────────────────────────────────

export async function actualizarEmpleada(id, datos) {
  const {
    nombre, apellido, telefono, rol,
    tipo_contrato, fecha_inicio, tipos_servicio, notas, tarifa_hora,
  } = datos;

  const { data: emp, error: fetchError } = await supabase
    .from('empleadas').select('usuario_id').eq('id', id).single();
  if (fetchError) return { empleada: null, error: fetchError };

  const updateUsuarios = {};
  if (nombre   !== undefined) updateUsuarios.nombre   = nombre;
  if (apellido !== undefined) updateUsuarios.apellido = apellido;
  if (telefono !== undefined) updateUsuarios.telefono = telefono || null;
  if (rol)                    updateUsuarios.rol      = rol;

  if (Object.keys(updateUsuarios).length > 0) {
    const { error: usrError } = await supabase
      .from('usuarios').update(updateUsuarios).eq('id', emp.usuario_id);
    if (usrError) return { empleada: null, error: usrError };
  }

  const { data, error } = await supabase
    .from('empleadas')
    .update({
      tipo_contrato:  tipo_contrato || null,
      fecha_inicio:   fecha_inicio || null,
      tipos_servicio: tipos_servicio || [],
      notas:          notas || null,
      tarifa_hora:    tarifa_hora ?? null,
    })
    .eq('id', id)
    .select()
    .single();

  return { empleada: data, error };
}

// ─── ACTIVA / INACTIVA ───────────────────────────────

export async function toggleEmpleadaActiva(id, activa) {
  const { data: emp, error: fetchError } = await supabase
    .from('empleadas').select('usuario_id').eq('id', id).single();
  if (fetchError) return { error: fetchError };

  const { error } = await supabase
    .from('usuarios').update({ activo: activa }).eq('id', emp.usuario_id);
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
  if (msg.includes('User already registered')) return 'An account with this email already exists.';
  if (msg.includes('duplicate key'))           return 'A staff member with this information already exists.';
  if (msg.includes('violates not-null'))       return 'Please complete all required fields.';
  if (msg.includes('permission'))              return 'You don\'t have permission for this action.';
  if (msg.includes('invalid email'))           return 'Invalid email address.';
  if (msg.includes('Email signups are disabled')) return 'Account creation is disabled in Supabase Auth settings. Enable Sign Ups in Auth → Providers → Email.';
  if (msg.includes('Email rate limit exceeded'))  return 'Too many signup attempts. Wait a few minutes.';
  if (msg.includes('Profile row not created by trigger')) return error.message;
  const code = error.code ? `[${error.code}] ` : '';
  return `${code}${msg.slice(0, 200)}`;
}

export function formatearNombreEmpleada(emp) {
  if (!emp) return '—';
  const u = emp.usuarios || emp;
  return `${u.nombre || ''} ${u.apellido || ''}`.trim() || '—';
}
