// js/i18n.js
// Motor simple de traducciones. Soporta dot notation: t('auth.sign_in').

let traducciones = {};
let idiomaActual = 'en';

/**
 * Carga las traducciones del idioma dado y lo persiste en localStorage.
 * @param {string} lang — 'en' o 'es'
 */
export async function setIdioma(lang) {
  idiomaActual = lang;
  localStorage.setItem('idioma', lang);
  try {
    const res = await fetch(`/i18n/${lang}.json`);
    traducciones = await res.json();
  } catch (err) {
    console.warn(`[i18n] No se pudo cargar /i18n/${lang}.json`);
  }
}

/**
 * Devuelve el idioma activo.
 * @returns {string}
 */
export function getIdioma() {
  return idiomaActual;
}

/**
 * Busca una clave de traducción con dot notation.
 * Si no existe, devuelve la clave como fallback.
 * @param {string} key — ej: 'auth.sign_in'
 * @returns {string}
 */
export function t(key) {
  const partes = key.split('.');
  let valor = traducciones;
  for (const p of partes) {
    valor = valor?.[p];
    if (valor === undefined) return key;  // fallback: devolver la key
  }
  return valor;
}

// Auto-init con idioma guardado o default 'en'
const guardado = localStorage.getItem('idioma') || 'en';
setIdioma(guardado);
