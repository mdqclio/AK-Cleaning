// panel/providers/js/providers-api.js
// Funciones de acceso a Supabase para el módulo de Providers.

import { supabase } from '../../../js/supabase-client.js';
import { sanitizarBusqueda } from '../../../js/safe-filter.js';
import { serverSideAccountsOn, crearCuentaAdmin } from '../../../js/admin-api.js';

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
    const s = `%${sanitizarBusqueda(busqueda)}%`;
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

// ─── CUENTA DE APP (helper compartido crear/actualizar) ──────────────────────

/**
 * Crea la cuenta de login (rol=proveedor) para un proveedor y devuelve usuario_id.
 * Usa la Edge Function si serverSideAccounts está ON; si no, el path legacy signUp.
 * @returns {{ usuario_id: string|null, error: object|null }}
 */
async function crearCuentaProveedor(accountInfo, datos) {
  if (serverSideAccountsOn()) {
    const { ok, usuario_id, error } = await crearCuentaAdmin({
      email:    accountInfo.email,
      rol:      'proveedor',
      nombre:   datos.contacto_nombre || datos.nombre_empresa,
      apellido: '(Provider)',
      telefono: datos.telefono || null,
    });
    return { usuario_id: ok ? usuario_id : null, error: ok ? null : error };
  }

  // Path legacy (signUp desde el browser).
  const { error: authError } = await supabase.auth.signUp({
    email: accountInfo.email,
    password: generarPasswordAleatoria(),
    options: { data: { nombre: datos.contacto_nombre || datos.nombre_empresa, apellido: '' } }
  });
  if (authError) return { usuario_id: null, error: authError };

  await new Promise(r => setTimeout(r, 500)); // esperar trigger

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
    return { usuario_id: null, error: updError || { message: 'Failed to create user record.' } };
  }

  await supabase.auth.resetPasswordForEmail(accountInfo.email, {
    redirectTo: `${window.location.origin}${window.APP_CONFIG?.basePath ?? ''}/login.html`
  });
  return { usuario_id: usuario.id, error: null };
}

// ─── CREAR ───────────────────────────────────────────

/**
 * Crear proveedor. Si conApp = true, también crea cuenta auth + usuario.
 * @returns {{ proveedor, error }}
 */
export async function crearProveedor(datos, conApp = false, accountInfo = null) {
  let usuario_id = null;

  if (conApp && accountInfo?.email) {
    const { usuario_id: uid, error } = await crearCuentaProveedor(accountInfo, datos);
    if (error) return { proveedor: null, error };
    usuario_id = uid;
  }

  const { data: proveedor, error: provError } = await supabase
    .from('proveedores')
    .insert({ ...datos, usuario_id })
    .select()
    .single();

  return { proveedor, error: provError };
}

// ─── ACTUALIZAR ──────────────────────────────────────

/**
 * Actualizar proveedor. Si opcionesApp = { email, idioma } y el proveedor NO
 * tiene cuenta aún, se la crea y se linkea (cierra el gap del toggle "app access"
 * en edición). Si ya tiene cuenta, opcionesApp se ignora.
 * @returns {{ proveedor, error }}
 */
export async function actualizarProveedor(id, datos, opcionesApp = null) {
  let payload = datos;

  // Alta de cuenta en edición: solo si se pidió y el proveedor no tiene una.
  if (opcionesApp?.email) {
    const { data: prov } = await supabase
      .from('proveedores').select('usuario_id').eq('id', id).single();
    if (!prov?.usuario_id) {
      const { usuario_id, error: accErr } = await crearCuentaProveedor(opcionesApp, datos);
      if (accErr) return { proveedor: null, error: accErr };
      payload = { ...datos, usuario_id };
    }
  }

  const { data, error } = await supabase
    .from('proveedores')
    .update(payload)
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
    const { error: errUsr } = await supabase
      .from('usuarios').update({ activo }).eq('id', prov.usuario_id);
    // Estado inconsistente si el proveedor se desactiva pero su login sigue activo.
    if (errUsr) return { error: errUsr };
  }
  return { error: null };
}

// ─── PASSWORD RESET ──────────────────────────────────

export async function reenviarPasswordResetProveedor(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.APP_CONFIG?.basePath ?? ''}/login.html`
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
