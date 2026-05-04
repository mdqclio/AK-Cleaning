# AK Cleaning & Management — Internal System

Stack: HTML + Alpine.js + Supabase.
Hosting: GitHub Pages.

## Estructura
- `/js` — auth, router, supabase client
- `/css` — estilos base y componentes
- `/i18n` — traducciones EN/ES
- `/panel` — panel admin (próximamente)
- `/app-empleada` — PWA empleadas (próximamente)
- `/app-proveedor` — PWA proveedores (próximamente)

## Desarrollo local
Servir desde la raíz con cualquier server estático:
```
python3 -m http.server 8000
# O bien:
npx http-server
```

Después abrir http://localhost:8000

## Estado
🚧 En desarrollo. Bloque actual: Auth + Login.
