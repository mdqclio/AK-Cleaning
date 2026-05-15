# AK Property Management — Internal System

Panel de gestión interna para AK Property Management Concierge Services (Miami Beach, FL).

**Stack:** HTML + Alpine.js + Supabase
**Hosting:** GitHub Pages — https://mdqclio.github.io/AK-Cleaning/

## Módulos activos

| Módulo | Estado |
|--------|--------|
| Auth + Login | ✅ Live |
| Panel Shell + Dashboard | ✅ Live |
| Clients | ✅ Live |
| Properties + Buildings | ✅ Live |
| Staff | ✅ Live |
| Providers | ✅ Live |
| Services Catalog | ✅ Live |
| Service Orders | ✅ Live + validado |
| Checklist Templates + OS | ✅ Live + validado |
| Invoicing (Etapas 1-2) | 🔄 Codeado — pendiente validación |
| Field Reports, PWA, Purchasing | ⏸ Pendientes |

## Desarrollo local

```bash
python3 -m http.server 8000
# Abrir http://localhost:8000 en Chrome
```

## Estructura

```
/
├── config.js          # Supabase URL + anon key + APP_CONFIG
├── login.html
├── index.html         # redirect a /panel/
├── css/               # base.css + components.css
├── js/                # auth, router, supabase-client, i18n
├── i18n/              # en.json, es.json
├── panel/             # módulos admin
├── assets/            # ak-logo.png
├── app-empleada/      # PWA empleadas (futuro)
└── app-proveedor/     # PWA proveedores (futuro)
```

Ver `docs/STATE.md` para estado detallado y `docs/PENDIENTES.md` para próximos pasos.
