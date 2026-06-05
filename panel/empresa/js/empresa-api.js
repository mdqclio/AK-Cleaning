// panel/system/js/config-empresa-api.js
// Lectura/escritura de la fila única config_empresa (datos de empresa y de pago
// que salen en la factura). RLS: SELECT admin, UPDATE owner/superadmin (014).

import { supabase } from '../../../js/supabase-client.js';

export const CAMPOS_CONFIG_EMPRESA = [
  'nombre_linea1', 'nombre_linea2', 'ciudad', 'telefono', 'email', 'website',
  'payable_to', 'banco', 'routing', 'account', 'swift',
  'contacto_nombre', 'contacto_telefono', 'contacto_email',
];

export async function obtenerConfigEmpresa() {
  const { data, error } = await supabase
    .from('config_empresa').select('*').eq('id', 1).maybeSingle();
  return { config: data, error };
}

export async function actualizarConfigEmpresa(datos) {
  // Whitelist: solo columnas editables (nunca id/actualizado_*).
  const payload = {};
  for (const k of CAMPOS_CONFIG_EMPRESA) {
    if (datos[k] !== undefined) payload[k] = datos[k] === '' ? null : datos[k];
  }
  const { data, error } = await supabase
    .from('config_empresa').update(payload).eq('id', 1).select().single();
  return { config: data, error };
}
