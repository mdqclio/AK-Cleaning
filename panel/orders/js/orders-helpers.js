// panel/orders/js/orders-helpers.js
// Funciones auxiliares: formato de fechas, monedas, conversión timezone Miami,
// helpers de display para clientes/asignados.

export const ESTADOS = {
  borrador:   { label: 'Draft',       color: '#9e9b93', bg: '#f2f1ee' },
  confirmada: { label: 'Confirmed',   color: '#1a6ba0', bg: '#e0ecf5' },
  en_curso:   { label: 'In Progress', color: '#d99a2b', bg: '#fdf3e0' },
  completada: { label: 'Completed',   color: '#2d7a4f', bg: '#e0f0e6' },
  cancelada:  { label: 'Cancelled',   color: '#d9534f', bg: '#fae5e4' }
};

export function estadoLabel(estado) {
  return ESTADOS[estado]?.label || estado;
}

export function calcularTotalServicios(servicios) {
  return servicios.reduce((acc, s) => {
    const qty = parseFloat(s.cantidad) || 0;
    const precio = parseFloat(s.precio_unitario) || 0;
    return acc + (qty * precio);
  }, 0);
}

export function formatearMoneda(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `$${Number(n).toFixed(2)}`;
}

export function formatearFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

export function formatearFechaCorta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric'
  });
}

export function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d);
  const get = t => parts.find(p => p.type === t)?.value || '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

export function datetimeLocalToISO(local) {
  if (!local) return null;
  const [fecha, hora] = local.split('T');
  const [y, m, d] = fecha.split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d, h, min));
  const miamiOffset = miamiOffsetMillisAt(utcDate);
  return new Date(utcDate.getTime() - miamiOffset).toISOString();
}

function miamiOffsetMillisAt(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = dtf.formatToParts(date);
  const get = t => parseInt(parts.find(p => p.type === t)?.value || 0, 10);
  let h = get('hour');
  if (h === 24) h = 0;
  const fingidoUTC = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
  return fingidoUTC - date.getTime();
}

export function nombreCliente(c) {
  if (!c) return '—';
  const base = `${c.nombre || ''} ${c.apellido || ''}`.trim();
  return c.razon_social ? `${c.razon_social} (${base})` : base;
}

export function nombrePropiedad(p) {
  if (!p) return '—';
  return p.nombre_referencia;
}

export function nombreAsignado(a) {
  if (a.empleadas?.usuarios) {
    const u = a.empleadas.usuarios;
    return `${u.nombre} ${u.apellido}`;
  }
  if (a.proveedores) {
    return a.proveedores.nombre_empresa;
  }
  return '—';
}

export function tipoAsignado(a) {
  if (a.empleada_id) return 'staff';
  if (a.proveedor_id) return 'provider';
  return null;
}
