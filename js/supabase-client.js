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

window.supabase = supabase;  // disponible en consola para debug
