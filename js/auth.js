// js/auth.js
// Funciones de autenticación: login, logout, sesión, datos de usuario, reset de password.

import { supabase } from './supabase-client.js';

/**
 * Inicia sesión con email y password.
 * @returns {{ ok: boolean, usuario: object|null, error: string|null }}
 */
export async function iniciarSesion(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return { ok: false, usuario: null, error: traducirErrorAuth(error.message) };
    }

    // Buscar el usuario en la tabla usuarios
    const { data: usuario, error: errorUsuario } = await supabase
      .from('usuarios')
      .select('*')
      .eq('auth_id', data.user.id)
      .eq('activo', true)
      .single();

    if (errorUsuario || !usuario) {
      await supabase.auth.signOut();
      return { ok: false, usuario: null, error: 'User not found or inactive. Contact administrator.' };
    }

    return { ok: true, usuario, error: null };
  } catch (err) {
    return { ok: false, usuario: null, error: 'Something went wrong. Please try again.' };
  }
}

/**
 * Cierra sesión y redirige al login.
 */
export async function cerrarSesion() {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
}

/**
 * Devuelve la sesión activa y los datos del usuario, o null si no hay sesión.
 * @returns {{ session: object, usuario: object }|null}
 */
export async function obtenerSesionActual() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const usuario = await obtenerDatosUsuario(session.user.id);
  if (!usuario) return null;

  return { session, usuario };
}

/**
 * Busca los datos del usuario en la tabla usuarios por auth_id.
 * @param {string} auth_id
 * @returns {object|null}
 */
export async function obtenerDatosUsuario(auth_id) {
  const { data } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_id', auth_id)
    .single();
  return data || null;
}

/**
 * Envía email de recuperación de contraseña.
 * @returns {{ ok: boolean, error: string|null }}
 */
export async function recuperarPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login.html`
  });
  return { ok: !error, error: error ? traducirErrorAuth(error.message) : null };
}

/**
 * Traduce mensajes de error de Supabase Auth a texto legible.
 * @param {string} msg
 * @returns {string}
 */
function traducirErrorAuth(msg) {
  if (msg.includes('Invalid login credentials')) return 'Invalid email or password';
  if (msg.includes('Email not confirmed'))       return 'Please verify your email before logging in';
  if (msg.includes('rate limit'))                return 'Too many attempts. Try again in a few minutes.';
  if (msg.includes('User not found'))            return 'Invalid email or password';
  return 'Something went wrong. Please try again.';
}
