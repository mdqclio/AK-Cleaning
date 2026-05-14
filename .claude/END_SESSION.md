# Protocolo de cierre de sesión

Ejecutar en orden al terminar una sesión de trabajo.

---

## Paso 1 — Verificar estado git

```bash
git status && git log --oneline -10
```

Confirmar que no hay cambios sin commitear.

---

## Paso 2 — Pregunta a Leonardo (UNA sola)

Antes de actualizar los docs, preguntar:

> "¿Querés que registre algo más que no esté en los commits o en lo que te conté?"

Esperar respuesta antes de continuar.

---

## Paso 3 — Actualizar documentación

Actualizar en este orden (leer cada archivo antes de editar):

### `docs/STATE.md`
Agregar sección nueva al principio con formato:
```
## Sesión DD Mmm YYYY — [título corto]
```
Incluir:
- Qué se hizo (commits, fixes, decisiones)
- SQL ejecutado fuera de migration (si aplica — crítico para reproducibilidad)
- Datos de prueba cargados o pendientes de limpiar
- Estado actual de cada bloque tocado

### `docs/PENDIENTES.md`
Actualizar con:
- Qué queda pendiente de validar
- Deuda técnica nueva identificada
- Mover items completados a la sección "Historial de pendientes cerrados"

### `CLAUDE.md`
Solo si hay cambios globales que aplican a toda sesión futura:
- Nuevos gotchas técnicos (sección "Patrones técnicos críticos")
- Cambios en el stack o hosting
- Nuevos IDs de usuarios relevantes
- Cambios en el estado de bloques

### `docs/ROADMAP.md`
Solo si cambió el scope de algún bloque.

---

## Paso 4 — Commit y push

```bash
git add docs/STATE.md docs/PENDIENTES.md CLAUDE.md
# + cualquier otro archivo modificado
git commit -m "docs: cierre sesión DD Mmm YYYY — [resumen en 5-8 palabras]"
git push
```

---

## Paso 5 — Despedida

Formato estándar de cierre:

```
Sesión cerrada. [1-2 oraciones con qué quedó listo y qué sigue.]

Commits de esta sesión:
- `hash` descripción
- `hash` descripción

Próxima sesión: [acción concreta para arrancar]
```

---

## Notas

- Si `docs/PENDIENTES.md` tiene checklist de validación de un bloque codeado sin validar,
  no borrarlo hasta que Leonardo confirme la validación en Mac.
- SQL ejecutado directamente en Supabase Dashboard (no vía migration) siempre debe
  quedar documentado en STATE.md con nota "pendiente formalizar como migration".
- Si hay datos de prueba que se decidió dejar, documentar cuáles son y por qué,
  para que no confundan en próxima sesión.
