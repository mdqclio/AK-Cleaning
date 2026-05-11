# Convenciones del proyecto

## Estructura de carpetas
```
ak-system/
├── config.js              # APP_CONFIG global (Supabase URL, anon key legacy, roles, theme, banco)
├── index.html             # redirect a /panel/ o /login
├── login.html             # Auth con Alpine
├── README.md
│
├── css/
│   ├── base.css           # CSS variables (--color-primary, --color-accent, fonts)
│   └── components.css     # botones, badges, tablas, modales, toasts
│
├── i18n/
│   ├── en.json            # principal
│   └── es.json
│
├── js/
│   ├── supabase-client.js # exporta `supabase` (usa skypack CDN)
│   ├── auth.js            # iniciarSesion, obtenerSesionActual, cerrarSesion
│   ├── router.js          # protección de rutas
│   └── i18n.js
│
├── panel/                 # admin web
│   ├── index.html         # redirect a dashboard
│   ├── dashboard.html
│   ├── css/panel.css
│   ├── js/
│   │   ├── panel-config.js   # MENU[] por sección con rolesPermitidos, menuParaRol()
│   │   └── panel-shell.js    # iniciarPanel(), sidebar render, logout, mobile
│   │
│   ├── clients/           # index.html + css/ + js/clients-api.js
│   ├── properties/        # index.html + css/ + js/properties-api.js
│   ├── staff/             # index.html + css/ + js/staff-api.js
│   ├── providers/         # index.html + css/ + js/providers-api.js
│   ├── services/
│   │   ├── index.html         # catálogo
│   │   ├── checklists.html    # ABM plantillas de checklist
│   │   ├── css/services.css
│   │   └── js/
│   │       ├── services-api.js
│   │       └── checklists-api.js
│   ├── orders/
│   │   ├── index.html
│   │   ├── css/orders.css
│   │   └── js/
│   │       ├── orders-api.js
│   │       └── orders-helpers.js
│   ├── invoices/          # vacío, Bloque J pendiente
│   ├── payments/          # vacío, futuro
│   ├── reports/           # vacío, Bloque K pendiente
│   ├── purchasing/        # vacío, Bloque N pendiente
│   ├── schedule/          # vacío, futuro
│   ├── users/             # vacío, futuro
│   └── system/            # solo superadmin (logs, health, config)
│
├── app-empleada/          # PWA (vacía, Bloque L futuro)
└── app-proveedor/         # PWA (vacía, Bloque M futuro)
```

## Naming
- **Archivos**: kebab-case (`clients-api.js`)
- **Funciones JS**: camelCase en español (`listarClientes`, `obtenerOrden`, `crearFactura`)
- **Variables JS**: camelCase en español (`clientesDropdown`, `modalAbierto`)
- **Tablas SQL**: snake_case en español (`clientes`, `ordenes_servicio`, `os_asignados`)
- **Columnas SQL**: snake_case en español (`creado_en`, `actualizado_por`, `programada_en`)
- **UI text**: inglés siempre (`"New Service Order"`, `"Active Clients"`)
- **i18n keys**: kebab-case en inglés (`"new-order"`, `"active-clients"`)

## Alpine.js — patrones obligatorios

### Estructura de página
```html
<body>
  <div class="panel-layout">
    <aside class="sidebar" id="sidebar"></aside>
    <main class="main">
      <header class="header" id="header"></header>
      <div class="content">
        <div x-data="paginaActual()" x-init="init()" x-cloak>
          <!-- contenido -->
        </div>
      </div>
    </main>
  </div>

  <script type="module">
    import { iniciarPanel } from '/panel/js/panel-shell.js';
    import { ... } from './js/...-api.js';

    (async () => {
      const usuario = await iniciarPanel({
        rolesPermitidos: ['superadmin','owner','admin'],
        itemActivo: 'clients',
        tituloHeader: 'Clients'
      });
      if (!usuario) return;

      window.paginaActual = function() {
        return {
          datos: [],
          cargando: true,
          modalAbierto: false,
          formData: {},
          toasts: [],

          async init() { ... },
          async recargar() { ... },
          async guardar() { ... },
          mostrarToast(tipo, mensaje) { ... }
        };
      };

      const Alpine = (await import('https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js')).default;
      window.Alpine = Alpine;
      Alpine.start();
      setTimeout(() => window.lucide?.createIcons(), 50);
    })();
  </script>
</body>
```

### Reglas Alpine
1. **Factory en `window`** registrada **antes** de `Alpine.start()`.
2. **IIFE async** envuelve todo el código del módulo (permite `return` y `await` top-level).
3. **`x-cloak`** en el div raíz para evitar flash de contenido no procesado.
4. **`x-if` para condicionales con acceso a propiedades**: si `obj` puede ser null y tenés `x-model="obj.algo"`, usar `<template x-if="obj">` no `x-show`.
5. **`x-for` siempre dentro de `<template>`** y con `:key` único.
6. **Re-render de Lucide**: después de cambios en DOM (modal abierto, items agregados), llamar `this.$nextTick(() => window.lucide?.createIcons())`.

## Patrones Supabase

### Conteo exact
```js
supabase.from(tabla).select('*', { count: 'exact', head: true }).eq(filtro, valor);
```

### Embed con FK explícita (caso ambiguo)
```js
.select(`*, servicios!plantillas_checklist_servicio_id_fkey(id, nombre_en)`)
```

### Optimistic locking
```js
const { data: actual } = await supabase
  .from('ordenes_servicio').select('version').eq('id', id).single();
if (actual?.version !== version) {
  return { error: { message: 'This order was modified by someone else.' } };
}
```

### Manejo de errores
Cada `*-api.js` exporta `traducirError(error)` que mapea mensajes Postgres a inglés legible.

## Theme (CSS variables en `css/base.css`)
```css
:root {
  --color-primary:     #0a1628;       /* Navy */
  --color-primary-mid: #1a3a5c;
  --color-accent:      #c9a84c;       /* Gold */
  --color-accent-light:#e8c97a;
  --color-bg:          #f9f8f5;
  --color-surface:     #ffffff;
  --color-border:      #e5e3de;
  --color-divider:     #f2f1ee;
  --color-text:        #2e2c28;
  --color-text-muted:  #5a5750;
  --color-text-soft:   #9e9b93;
  --color-danger:      #d9534f;
  --color-warning:     #d99a2b;
  --color-success:     #2d7a4f;
  --color-info:        #1a6ba0;

  --font-body:    'DM Sans', sans-serif;
  --font-display: 'Playfair Display', serif;

  --radius-sm: 4px; --radius: 8px; --radius-lg: 12px;
  --space-xs: 4px; --space-sm: 8px; --space-md: 16px;
  --space-lg: 24px; --space-xl: 40px; --space-2xl: 64px;
  --transition-fast: 0.15s ease;
  --transition: 0.25s ease;

  --text-xs: 11px; --text-sm: 13px; --text-base: 15px;
  --text-md: 17px; --text-lg: 20px; --text-xl: 26px;
  --text-2xl: 32px; --text-3xl: 44px;
}
```

## Workflow incremental obligatorio (lección aprendida del crash Bloque I)
1. Un cambio puntual.
2. Commit + push.
3. Leonardo hace pull + testea.
4. Confirma OK.
5. Siguiente cambio.

**NUNCA** batchear varios cambios funcionales en un solo commit.

## Storage de archivos (Supabase Storage)

### Bucket `facturas`
- Público (acceso por URL directa, sin token)
- Sin restricción de MIME types
- Estructura de paths: `facturas/<año>/<numero>.pdf` (ej `facturas/2026/1001.pdf`)

### Patrón de upload + URL pública
```js
const path = `${año}/${numero}.pdf`;

// Upload
const { error } = await supabase.storage
  .from('facturas')
  .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });

// URL pública (no expira, bucket público)
const { data: { publicUrl } } = supabase.storage
  .from('facturas')
  .getPublicUrl(path);
```

### RLS del bucket
Usan `tiene_acceso_admin()` igual que las tablas:
- INSERT / UPDATE / DELETE: solo admins
- SELECT: público (cualquiera con el link)

### PDF con html2pdf.js
- CDN: `https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js`
- El div de render (`#pdf-render-area`) va FUERA del `x-data` de Alpine, `position:fixed; left:-9999px`
- Logo precargado como base64 en `init()` para evitar problemas CORS con html2canvas
- Opciones: `{ margin:0, html2canvas: { scale:2, useCORS:true }, jsPDF: { format:'a4' } }`
- Output: `.outputPdf('blob')` → luego `URL.createObjectURL(blob)` para el preview iframe
- Revocar el blob URL al cerrar preview: `URL.revokeObjectURL(url)`

## Bug patterns conocidos (no repetir)
- `return` top-level en module → IIFE async
- `x-show` + `x-model` en propiedades de objeto null → `x-if`
- FKs ambiguas en embed → especificar nombre del constraint
- `cat > heredoc` para JS/CSS → corrompe con HTML wrapper
- Brave + loops Alpine → crashea pestaña; usar Chrome para testear primero
- Chrome consola bloquea paste → `allow pasting`
- `sb_publishable_*` key → no funciona en REST; usar legacy JWT
- Status 300 + disk cache → DevTools "Disable cache"
- `<input type="date">` con `x-model` no muestra valor inicial → usar `:value` + `@change`
- `html2pdf` en Brave puede fallar si bloquea el CDN de cdnjs → usar Chrome
