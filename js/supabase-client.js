// js/supabase-client.js
// Instancia única del cliente Supabase. Importar siempre desde acá.

import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js@2';

const { url, anon_key } = window.APP_CONFIG.supabase;

export const supabase = createClient(url, anon_key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

// Exponer el cliente en consola SOLO en desarrollo local (basePath === '').
// En producción (GitHub Pages, basePath === '/AK-Cleaning') no se expone:
// reduce la superficie para exfiltración manual y para la cadena de escalada
// de privilegios documentada en docs/auditoria.md (hallazgo C1 / supabase-client.js).
if ((window.APP_CONFIG?.basePath ?? '') === '') {
  window.supabase = supabase;  // debug local
}
