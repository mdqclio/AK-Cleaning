// config.js
// Configuración global de la app AK Cleaning & Management.

// Detecta el base path para GitHub Pages vs localhost.
// En GH Pages config.js está en /AK-Cleaning/config.js → basePath = '/AK-Cleaning'
// En localhost está en /config.js → basePath = ''
const _BASE = (function () {
  const src = document.currentScript && document.currentScript.src;
  if (!src) return '';
  return src.replace(/\/config\.js(\?.*)?$/, '').replace(/^https?:\/\/[^/]+$/, '');
})();

const APP_CONFIG = {
  basePath: _BASE,

  empresa: {
    nombre: 'AK Cleaning & Management',
    nombre_legal: 'AK Property Management Concierge Services',
    nombre_corto: 'AK',
    website: 'www.akconciergeservices.com',
    email: 'akconciergeservices@gmail.com',
    telefono: '786-253-7983',
    direccion: 'Miami Beach, FL 33140',
    contacto_facturas: {
      nombre: 'Andrea Manca',
      telefono: '786-253-7983',
      email: 'andy.flo@hotmail.com'
    },
    banco: {
      nombre: 'Citibank',
      routing: '266086554',
      account: '9135063896',
      swift: 'CITIUS33',
      payable_to: 'AK Property Management Concierge Services'
    }
  },

  supabase: {
    url:      'https://ccdpbiflbewhnidigiin.supabase.co',
    anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjZHBiaWZsYmV3aG5pZGlnaWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4Mjk1NDAsImV4cCI6MjA5MzQwNTU0MH0.2P9jPdqNsI99cq6kaD8umkHtmq0dzNLmDe8MFnKwMIQ'
  },

  roles: {
    superadmin: { label: 'System Admin',  redirect: _BASE + '/panel/' },
    owner:      { label: 'Owner',         redirect: _BASE + '/panel/' },
    admin:      { label: 'Administrator', redirect: _BASE + '/panel/' },
    compras:    { label: 'Purchasing',    redirect: _BASE + '/panel/' },
    empleada:   { label: 'Staff',         redirect: _BASE + '/app-empleada/' },
    proveedor:  { label: 'Provider',      redirect: _BASE + '/app-proveedor/' }
  },

  tema: {
    primary: '#0a1628',  // Navy
    accent:  '#c9a84c',  // Gold
    fuente:  'DM Sans'
  },

  idioma_panel:    'en',
  idiomas_apps:    ['es', 'en']
};

window.APP_CONFIG = APP_CONFIG;
