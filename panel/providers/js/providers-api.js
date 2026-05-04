// panel/providers/js/providers-api.js
// Funciones de acceso a Supabase para el módulo de Providers.

import { supabase } from '/js/supabase-client.js';

// ─── CONSTANTES ──────────────────────────────────────

export const RUBROS_SUGERIDOS = [
  'Electrical', 'Plumbing', 'Masonry', 'Carpentry', 'Painting',
  'HVAC', 'Appliance Repair', 'Locksmith', 'Pool Service',
  'Landscaping', 'Pest Control', 'Window Cleaning', 'Moving',
  'Catering', 'Florist', 'Photography'
];

export const TIPOS_FISCALES = [
  { value: 'w9_individual', label: 'W-9 Individual (SSN)' },
  { value: 'w9_business',   label: 'W-9 Business (EIN)' },
  { value: 'foreign',       label: 'Foreign Provider (W-8)' }
];

// ─── LISTADO ─────────────────────────────────────────

export async function listarProveedores({
  busqueda = '', rubro = 'all', conApp = 'all', estado = 'all',
  pagina = 1, porPagina = 20
} = {}) {

  let query = supabase
    .from('proveedores')
    .select('*, usuarios(id, email, activo)', { count: 'exact' });

  if (busqueda) {
    const s = `%${busqueda}%`;
    query = query.or(
      `nombre_empresa.ilike.${s},contacto_nombre.ilike.${s},email.ilike.${s},telefono.ilike.${s}`
    );
  }

  if (estado === 'active')   query = query.eq('activo', true);
  if (estado === 'inactive') query = query.eq('activo', false);

  if (rubro !== 'all') query = query.contains('rubros', [rubro]);

  if (conApp === 'yes') query = query.not('usuario_id', 'is', null);
  if (conApp === 'no')  query = query.is('usuario_id', null);

  query = query.order('nombre_empresa');

  const desde = (pagina - 1) * porPagina;
  const hasta = desde + porPagina - 1;
  query = query.range(desde, hasta);

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
}

// ─── DETALLE ─────────────────────────────────────────

export async function obtenerProveedor(id) {
  const { data, error } = await supabase
    .from('proveedores')
    .select('*, usuarios(id, email, idioma, activo)')
    .eq('id', id)
    .single();
  return { proveedor: data, error };
}

// ─── CREAR ───────────────────────────────────────────

/**
 * Crear proveedor. Si conApp = true, también crea cuenta auth + usuario.
 * @returns {{ proveedor, error }}
 */
export async function crearProveedor(datos, conApp = false, accountInfo = null) {
  let usuario_id = null;

  if (conApp && accountInfo?.email) {
    // 1. Crear cuenta auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: accountInfo.email,
      password: generarPasswordAleatoria(),
      options: {
        data: { nombre: datos.contacto_nombre || datos.nombre_empresa, apellido: '' }
      }
    });
    if (authError) return { proveedor: null, error: authError };

    // 2. Esperar trigger de DB
    await new Promise(r => setTimeout(r, 500));

    // 3. Actualizar fila en usuarios
    const { data: usuario, error: updError } = await supabase
      .from('usuarios')
      .update({
        nombre:   datos.contacto_nombre || datos.nombre_empresa,
        apellido: '(Provider)',
        telefono: datos.telefono || null,
        rol:      'proveedor',
        idioma:   accountInfo.idioma || 'en',
        activo:   true
      })
      .eq('email', accountInfo.email)
      .select()
      .single();

    if (updError || !usuario) {
      return { proveedor: null, error: updError || { message: 'Failed to create user record.' } };
    }
    usuario_id = usuario.id;

    // 4. Email de bienvenida con link de password
    await supabase.auth.resetPasswordForEmail(accountInfo.email, {
      redirectTo: `${window.location.origin}/login.html`
    });
  }

  // 5. Crear proveedor
  const { data: proveedor, error: provError } = await supabase
    .from('proveedores')
    .insert({ ...datos, usuario_id })
    .select()
    .single();

  return { proveedor, error: provError };
}

// ─── ACTUALIZAR ──────────────────────────────────────

export async function actualizarProveedor(id, datos) {
  const { data, error } = await supabase
    .from('proveedores')
    .update(datos)
    .eq('id', id)
    .select()
    .single();
  return { proveedor: data, error };
}

// ─── TOGGLE STATUS ───────────────────────────────────

export async function toggleProveedorActivo(id, activo) {
  const { data: prov } = await supabase
    .from('proveedores').select('usuario_id').eq('id', id).single();

  const { error: errProv } = await supabase
    .from('proveedores').update({ activo }).eq('id', id);
  if (errProv) return { error: errProv };

  if (prov?.usuario_id) {
    await supabase.from('usuarios').update({ activo }).eq('id', prov.usuario_id);
  }
  return { error: null };
}

// ─── PASSWORD RESET ──────────────────────────────────

export async function reenviarPasswordResetProveedor(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login.html`
  });
  return { error };
}

// ─── UTILIDADES ──────────────────────────────────────

function generarPasswordAleatoria() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  let pass = '';
  for (let i = 0; i < 16; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
  return pass;
}

export function traducirError(error) {
  if (!error) return null;
  const msg = error.message || error.toString();
  if (msg.includes('User already registered'))         return 'A user with this email already exists.';
  if (msg.includes('duplicate key') && msg.includes('email')) return 'Email already in use.';
  if (msg.includes('rating'))                          return 'Rating must be between 1 and 5.';
  if (msg.includes('rate limit'))                      return 'Too many requests. Try again in a few minutes.';
  if (msg.includes('violates not-null'))               return 'Please complete all required fields.';
  if (msg.includes('Invalid email'))                   return 'Please enter a valid email address.';
  return 'Something went wrong. Please try again.';
}
