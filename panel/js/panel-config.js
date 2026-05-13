// panel/js/panel-config.js
// Configuración del menú lateral del panel y permisos por rol.

const B = window.APP_CONFIG?.basePath ?? '';

export const MENU = [
  {
    seccion: 'Overview',
    items: [
      { id: 'dashboard',  label: 'Dashboard',        icono: 'layout-dashboard', href: B + '/panel/dashboard.html', roles: ['superadmin','owner','admin','compras'] }
    ]
  },
  {
    seccion: 'Operations',
    items: [
      { id: 'orders',     label: 'Service Orders',   icono: 'clipboard-list',   href: B + '/panel/orders/',       roles: ['superadmin','owner','admin'] },
      { id: 'schedule',   label: 'Schedule',         icono: 'calendar-clock',   href: B + '/panel/schedule/',     roles: ['superadmin','owner','admin'] },
      { id: 'reports',    label: 'Field Reports',    icono: 'alert-circle',     href: B + '/panel/reports/',      roles: ['superadmin','owner','admin'] },
      { id: 'purchasing', label: 'Purchasing',       icono: 'shopping-cart',    href: B + '/panel/purchasing/',   roles: ['superadmin','owner','admin','compras'] }
    ]
  },
  {
    seccion: 'Records',
    items: [
      { id: 'clients',    label: 'Clients',          icono: 'users',            href: B + '/panel/clients/',      roles: ['superadmin','owner','admin'] },
      { id: 'properties', label: 'Properties',       icono: 'building-2',       href: B + '/panel/properties/',   roles: ['superadmin','owner','admin'] },
      { id: 'staff',      label: 'Staff',            icono: 'user-circle-2',    href: B + '/panel/staff/',        roles: ['superadmin','owner','admin'] },
      { id: 'providers',  label: 'Providers',        icono: 'briefcase',        href: B + '/panel/providers/',    roles: ['superadmin','owner','admin'] }
    ]
  },
  {
    seccion: 'Finance',
    items: [
      { id: 'invoices',   label: 'Invoicing',        icono: 'file-text',        href: B + '/panel/invoices/',     roles: ['superadmin','owner','admin'] },
      { id: 'payments',   label: 'Payments',         icono: 'dollar-sign',      href: B + '/panel/payments/',     roles: ['superadmin','owner','admin'] }
    ]
  },
  {
    seccion: 'Setup',
    items: [
      { id: 'services',   label: 'Services Catalog', icono: 'layers',           href: B + '/panel/services/',     roles: ['superadmin','owner','admin'] },
      { id: 'users',      label: 'Users',            icono: 'shield-check',     href: B + '/panel/users/',        roles: ['superadmin','owner'] }
    ]
  },
  {
    // Sección oculta solo para superadmin (vendor)
    seccion: 'System',
    soloRol: 'superadmin',
    items: [
      { id: 'system-logs',   label: 'Audit Log',     icono: 'scroll-text',      href: B + '/panel/system/logs.html',    roles: ['superadmin'] },
      { id: 'system-health', label: 'System Health', icono: 'activity',         href: B + '/panel/system/health.html',  roles: ['superadmin'] },
      { id: 'system-config', label: 'Configuration', icono: 'sliders',          href: B + '/panel/system/config.html',  roles: ['superadmin'] }
    ]
  }
];

/**
 * Filtra el menú según el rol del usuario.
 * Oculta secciones con soloRol si no coincide, y filtra items individuales.
 */
export function menuParaRol(rol) {
  return MENU
    .filter(seccion => !seccion.soloRol || seccion.soloRol === rol)
    .map(seccion => ({
      ...seccion,
      items: seccion.items.filter(item => item.roles.includes(rol))
    }))
    .filter(seccion => seccion.items.length > 0);
}
