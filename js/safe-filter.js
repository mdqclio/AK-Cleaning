// js/safe-filter.js
// Saneo de términos de búsqueda para los filtros .or() de PostgREST.
// Ver docs/auditoria.md → Bloque 4, hallazgo "inyección de filtro PostgREST".
//
// En la sintaxis de PostgREST .or("col.ilike.%term%,otra.ilike.%term%"), los
// caracteres `,` `(` `)` y `\` tienen significado estructural: separan
// condiciones, abren/cierran grupos y escapan. Un término con esos caracteres
// puede romper el filtro o inyectar condiciones (p.ej. "x,rol.eq.superadmin").
// Esta función los neutraliza dejando intacto el resto (letras, números,
// espacios, @ . - _ para emails/teléfonos).

export function sanitizarBusqueda(busqueda) {
  return String(busqueda ?? '')
    .replace(/[,()\\]/g, ' ')   // quita separadores/grupos/escape de PostgREST
    .replace(/\s+/g, ' ')
    .trim();
}
