// js/money.js
// Helpers de precisión monetaria. Ver docs/auditoria.md → Bloque 3, hallazgo #10.
// Toda la aritmética de dinero del front debe pasar por acá para evitar colas
// binarias del float (p.ej. 100.00000000001) que rompen comparaciones de saldo.

/** Redondea a centavos (2 decimales), robusto al error de coma flotante. */
export function redondear(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Suma una lista de montos redondeando el resultado. */
export function sumar(montos) {
  return redondear((montos || []).reduce((acc, m) => acc + Number(m || 0), 0));
}

/** True si el monto es cero dentro de la tolerancia de medio centavo. */
export function esCero(x) {
  return Math.abs(Number(x) || 0) < 0.005;
}

/**
 * Devuelve una copia de `obj` con los campos indicados redondeados a centavos.
 * Solo toca claves presentes; deja el resto intacto.
 */
export function redondearCampos(obj, campos) {
  const out = { ...obj };
  for (const c of campos) {
    if (out[c] !== undefined && out[c] !== null) out[c] = redondear(out[c]);
  }
  return out;
}
