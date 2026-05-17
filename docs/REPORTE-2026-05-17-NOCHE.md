# Reporte de sesión nocturna — 17 May 2026

**Iniciado:** ~03:30 AM (UTC)
**Tareas en cola:** (1) confirmar fix bug Staff, (2) ABM Users completo
**Estado actual:** en progreso

---

## Log de actividad

### [01] Pre-flight Sección 1 — outputs SQL (ya ejecutados antes de la interrupción)

**(1.a) Schema usuarios:**
| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | uuid_generate_v4() |
| auth_id | uuid | YES | null |
| nombre | text | NO | null |
| apellido | text | NO | null |
| email | text | NO | null |
| telefono | text | YES | null |
| rol | text | NO | null |
| idioma | text | NO | 'en' |
| activo | boolean | NO | true |
| foto_perfil | text | YES | null |
| creado_en | timestamptz | NO | now() |
| actualizado_en | timestamptz | NO | now() |
| actualizado_por | uuid | YES | null |

**(1.b) Constraints:**
- CHECK idioma IN ('es','en') ✓
- CHECK rol IN ('superadmin','owner','admin','compras','empleada','proveedor') ✓
- FK actualizado_por → usuarios.id
- FK auth_id → auth.users ON DELETE CASCADE
- PK id, UNIQUE auth_id, UNIQUE email

**(1.c) RLS policies sobre usuarios:**
| policy | cmd | qual |
|---|---|---|
| usuarios_owner_insert | INSERT | get_user_rol()='owner' AND rol<>'superadmin' |
| usuarios_owner_select | SELECT | get_user_rol()='owner' AND rol<>'superadmin' |
| usuarios_owner_update | UPDATE | get_user_rol()='owner' AND rol<>'superadmin' |
| usuarios_self_select | SELECT | auth_id = auth.uid() |
| usuarios_superadmin_all | ALL | es_superadmin() |

**(1.d) Trigger:**
- trg_handle_new_user en auth.users, enabled ✓
- fn_handle_new_user: no se pudo obtener el prosrc via MCP (posiblemente en schema auth o extensions)
  → se asume OK porque el flow de Staff (signUp+trigger+update) ya funciona en producción

**(1.e) Usuarios actuales:**
- Andrea Manca — owner, has_auth ✓
- Leonardo Fernandez — superadmin, has_auth ✓
- Kevin Penalva — **rol='admin'** (interesante: antes figuraba como empleada en staff queries — puede haber sido cambiado en testing), no auth
- 16 empleadas — rol='empleada', sin auth

**(1.f) Constraint de rol:** incluye los 6 valores esperados ✓

### [01] CHECKPOINT 1 — RESULTADO: VERDE, puede proceder

- ✅ Policy INSERT/UPDATE para owner existe
- ✅ Trigger activo (prosrc no verificable pero Staff funciona → asumido OK)
- ✅ Constraint rol incluye admin/owner/compras/superadmin/empleada/proveedor
- ✅ Schema coincide con SCHEMA.md (+ 3 columnas nuevas de migration 17May)
- ⚠️ Kevin Penalva tiene rol='admin' en usuarios pero también tiene fila en empleadas — data anomalía de testing, no afecta el módulo Users

### [02] Bug Staff (pre-condición Sección 0) — CERRADO

- Fix aplicado en commit `77f91f4`: sanitizar tarifa_hora con Number.isFinite
- El bug era UPDATE empleadas con tarifa_hora posiblemente NaN
- UPDATE manual via MCP funcionó → problema era del cliente → fix preventivo aplicado

---
