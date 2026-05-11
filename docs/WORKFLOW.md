# Workflow de desarrollo

## Setup (una sola vez)
1. Codespace conectado al repo `mdqclio/AK-Cleaning`, branch `main`.
2. Mac de Leonardo: clonó el repo en `/Users/leonardofernandez/Desktop/Ak Cleaning/ak-system`.
3. Supabase project `ccdpbiflbewhnidigiin` con schema aplicado.

## Ciclo de trabajo standard

### 1. Codespace (Claude Code edita)
```bash
cd /workspaces/AK-Cleaning
# editar archivos con Edit/Write/str_replace
git add <archivos>
git commit -m "descripción"
git push origin main
```

### 2. Mac de Leonardo (testea)
```bash
cd "/Users/leonardofernandez/Desktop/Ak Cleaning/ak-system"
git pull
# Si server no corre:
python3 -m http.server 8000
```

Browser: `http://localhost:8000` → Chrome (no Brave).

### 3. Si hay bug, vuelve a Codespace
- Leonardo describe el bug
- Si DevTools muestra error, copia el texto
- Iteramos con un commit chico → pull → re-test

## Forzar revert (cuando algo se rompe feo)

Desde Codespaces:
```bash
git fetch origin
git reset --hard <commit-hash-bueno>
git push --force origin main
```

Desde Mac (después del force push en Codespaces):
```bash
git fetch origin
git reset --hard origin/main
```

⚠️ `git reset --hard` borra cambios locales sin commitear. Solo seguro si la verdad está en el remoto.

## Commit estable de fallback
`d4f91c6` — "Bloque H: Service Orders module". Estado limpio antes de Bloque I, validado funcional.

## Mac sin push (problema conocido)
La Mac de Leonardo no tiene credenciales push funcionando:
- HTTPS pide Personal Access Token y la terminal vieja no acepta paste de token
- SSH key creada pero el `git remote set-url` no se aplica (raro, posiblemente alias zsh)

**Workaround**: TODO push se hace desde Codespaces. Mac solo `git pull`.

## Testing en navegador

### Chrome (recomendado)
1. F12 → Network tab → tildar "Disable cache" y "Preserve log"
2. Cmd+Shift+R (hard reload)
3. Para pegar código en consola: tipear `allow pasting` + Enter
4. DevTools → Application → Storage → "Clear site data" si hay sesión cacheada rara

### Errores comunes vistos en Network
- **Status 300 + (disk cache)** → respuesta desde cache, no llega al servidor. Tildar "Disable cache".
- **400 en `/auth/v1/token?grant_type=password`** → password mal o user no confirmado. Solución: Supabase Dashboard → Authentication → Users → Send password recovery.
- **PGRST201 con "more than one relationship found"** → FK ambigua, usar embed explícito.
- **Error "violates row-level security"** → RLS policy bloquea. Verificar rol del usuario y policies de la tabla.

## Conflicto git pull con archivos subidos por web

Si Leonardo sube un archivo binario (imagen, PDF) desde GitHub web, y a la vez hay un commit de Claude Code sin pull previo, el `git pull` en la Mac puede conflictuar.

**Fix**: antes de `git pull`, eliminar el archivo local si existe:
```bash
rm assets/ak-logo.png   # o el archivo que conflictúe
git pull
```

Alternativa: desde Codespaces hacer `git pull --rebase` antes de cada push (ya incorporado como práctica estándar).

## Supabase — ejecutar SQL

Leonardo va a Supabase Dashboard → SQL Editor → New query → pegar → Run.

⚠️ Bug conocido: al pegar SQL con comentarios al inicio, a veces se pierde el `--` de la primera línea. Verificar que la primera línea visible empiece con `--` antes de Run.

## Supabase — verificar funciones con SECURITY DEFINER

Las funciones con `SECURITY DEFINER` no siempre aparecen en `pg_proc` con queries estándar. Para verificar si una función existe y ver su definición:
```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'nombre_funcion';
```

## Procedimiento de recuperación de chat colgado

Si una sesión de Claude (web) se vuelve muy larga y empieza a colgarse:
1. Pedirle a Claude que genere un "handoff doc" con: decisiones cerradas, estado actual, próximos pasos, gotchas.
2. Abrir chat nuevo, pegar el handoff doc.
3. Continuar.

Si el chat ya está colgado:
1. Exportar la conversación (RTFD desde Mac, o copy-paste a archivo).
2. En un chat nuevo, pedirle al asistente que analice el archivo y genere el handoff.
3. Eso es exactamente lo que hicimos para generar ESTOS archivos.
