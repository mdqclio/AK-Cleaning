// panel/js/panel-shell.js
// Inicializa el shell del panel: protege ruta, arma sidebar y header,
// inyecta sesión del usuario y maneja logout.

import { protegerRuta } from '/js/router.js';
import { cerrarSesion } from '/js/auth.js';
import { menuParaRol } from './panel-config.js';

/**
 * Inicializa el shell. Debe llamarse desde cada página del panel
 * pasando el ID del item del menú activo.
 *
 * @param {object} opciones
 * @param {string[]} opciones.rolesPermitidos - Roles que pueden acceder a la página.
 * @param {string} opciones.itemActivo - ID del item del menú activo.
 * @param {string} opciones.tituloHeader - Título a mostrar en el header.
 * @returns {object|null} El usuario, o null si redirigió.
 */
export async function iniciarPanel({ rolesPermitidos, itemActivo, tituloHeader }) {
  const usuario = await protegerRuta(rolesPermitidos);
  if (!usuario) return null;

  renderSidebar(usuario, itemActivo);
  renderHeader(usuario, tituloHeader);
  conectarLogout();
  inicializarMobileMenu();

  // Activar iconos Lucide al final, cuando el DOM ya tiene todo
  if (window.lucide) window.lucide.createIcons();

  return usuario;
}

/**
 * Renderiza el sidebar con los items del menú filtrados según el rol.
 */
function renderSidebar(usuario, itemActivo) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const menu = menuParaRol(usuario.rol);
  const labelRol = window.APP_CONFIG.roles[usuario.rol]?.label || usuario.rol;
  const inicial = (usuario.nombre?.[0] || '') + (usuario.apellido?.[0] || '');

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-brand-circle">AK</div>
      <div class="sidebar-brand-text">
        AK Cleaning
        <small>Concierge</small>
      </div>
    </div>

    <nav class="sidebar-nav">
      ${menu.map(seccion => `
        <div class="nav-section-title">${seccion.seccion}</div>
        ${seccion.items.map(item => `
          <a href="${item.href}" class="nav-item ${item.id === itemActivo ? 'active' : ''}">
            <i data-lucide="${item.icono}"></i>
            <span>${item.label}</span>
          </a>
        `).join('')}
      `).join('')}
    </nav>

    <div class="sidebar-user">
      <div class="user-avatar">${inicial.toUpperCase()}</div>
      <div class="user-info">
        <div class="user-name">${usuario.nombre} ${usuario.apellido}</div>
        <div class="user-role">${labelRol}</div>
      </div>
      <button id="btn-logout" class="user-logout" title="Sign out">
        <i data-lucide="log-out"></i>
      </button>
    </div>
  `;
}

/**
 * Renderiza el header con título y botones de acción.
 */
function renderHeader(usuario, titulo) {
  const header = document.getElementById('header');
  if (!header) return;

  header.innerHTML = `
    <button class="btn-menu-toggle" id="btn-menu-toggle" title="Menu">
      <i data-lucide="menu"></i>
    </button>
    <h1 class="header-title">${titulo}</h1>
    <div class="header-spacer"></div>
    <button class="header-icon-btn" title="Search">
      <i data-lucide="search"></i>
    </button>
    <button class="header-icon-btn" title="Notifications">
      <i data-lucide="bell"></i>
      <span class="notification-dot"></span>
    </button>
    <button class="header-icon-btn" title="Help">
      <i data-lucide="help-circle"></i>
    </button>
  `;
}

/**
 * Conecta el botón de logout.
 */
function conectarLogout() {
  const btn = document.getElementById('btn-logout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (confirm('Sign out?')) {
      await cerrarSesion();
    }
  });
}

/**
 * Toggle del sidebar en mobile con overlay.
 */
function inicializarMobileMenu() {
  const btn = document.getElementById('btn-menu-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;

  btn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    let overlay = document.getElementById('sidebar-overlay');
    if (sidebar.classList.contains('open')) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', () => {
          sidebar.classList.remove('open');
          overlay.remove();
        });
        document.body.appendChild(overlay);
      }
    } else if (overlay) {
      overlay.remove();
    }
  });
}
