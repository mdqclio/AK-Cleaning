// js/router.js
// Protección de rutas y redirección según rol del usuario.

import { obtenerSesionActual } from './auth.js';

/**
 * Protege una ruta verificando sesión activa y rol permitido.
 * Si no hay sesión: redirige a /login.html.
 * Si el rol no es permitido: redirige al panel correspondiente al rol.
 * @param {string[]} rolesPermitidos
 * @returns {object|null} El objeto usuario si tiene acceso, null si redirigió.
 */
export async function protegerRuta(rolesPermitidos) {
  const sesion = await obtenerSesionActual();

  if (!sesion || !sesion.usuario) {
    window.location.href = (window.APP_CONFIG?.basePath ?? '') + '/login.html';
    return null;
  }

  if (!rolesPermitidos.includes(sesion.usuario.rol)) {
    redirigirSegunRol(sesion.usuario);
    return null;
  }

  return sesion.usuario;
}

/**
 * Redirige al panel o app correspondiente según el rol del usuario.
 * @param {object} usuario
 */
export function redirigirSegunRol(usuario) {
  const config = window.APP_CONFIG.roles[usuario.rol];
  if (config && config.redirect) {
    window.location.href = config.redirect;
  } else {
    window.location.href = (window.APP_CONFIG?.basePath ?? '') + '/login.html';
  }
}
