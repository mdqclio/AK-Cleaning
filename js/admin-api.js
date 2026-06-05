// js/admin-api.js
// Cliente de las operaciones administrativas server-side (Edge Functions).
// Ver docs/auditoria.md → Bloque 2 y supabase/functions/admin-create-user/.

import { supabase } from './supabase-client.js';

/**
 * ¿Está habilitada la creación de cuentas server-side (Edge Function)?
 * Mientras sea false, los módulos siguen usando el flujo viejo de signUp().
 * Poner true SOLO después de deployar la función admin-create-user.
 */
export function serverSideAccountsOn() {
  return window.APP_CONFIG?.features?.serverSideAccounts === true;
}

/**
 * Crea una cuenta (usuario/empleada/proveedor) vía Edge Function con service_role.
 * El rol se fija del lado servidor tras verificar que el caller es owner/superadmin.
 * NO hijackea la sesión del admin (a diferencia del signUp() cliente).
 *
 * @param {object} payload - { email, rol, nombre, apellido, telefono?, ...empleada }
 * @returns {{ ok: boolean, action_link: string|null, error: object|null }}
 */
export async function crearCuentaAdmin(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, action_link: null, error: { message: 'No active session' } };
  }

  const base = window.APP_CONFIG.supabase.url.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/functions/v1/admin-create-user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': window.APP_CONFIG.supabase.anon_key,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, action_link: null, error: { message: data.error || `HTTP ${res.status}` } };
    }
    return { ok: true, action_link: data.action_link ?? null, error: null };
  } catch (err) {
    return { ok: false, action_link: null, error: err };
  }
}
