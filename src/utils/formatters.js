const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCurrency(value) {
  return inr.format(Number(value) || 0);
}

export function formatCompactCurrency(value) {
  return `₹${inrCompact.format(Number(value) || 0)}`;
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Local calendar-day key (not toISOString, which shifts the day backward in
// any timezone ahead of UTC) so a <input type="date"> value can be matched
// against a stored date reliably.
export function localDateKey(value) {
  const date = toDate(value);
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(from, to = new Date()) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return 0;
  return Math.floor((b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0)) / 86400000);
}

// Half-open buckets on age = as-of date − bill date, so a bill sitting
// exactly on a boundary (e.g. 30 days old) rolls into the older bucket
// instead of double-counting at both edges: 0-30 is [0,30), 30-60 is
// [30,60), 60-90 is [60,90), 90+ is [90,∞).
export function agingBucket(ageDays) {
  if (ageDays < 30) return '0-30 Days';
  if (ageDays < 60) return '30-60 Days';
  if (ageDays < 90) return '60-90 Days';
  return 'Above 90 Days';
}

// Excel/PDF export shouldn't dump raw field values (Firestore Timestamps,
// etc.) — prefer a column's display render() when it yields plain text, since
// that's already been through formatDate/formatCurrency. Columns that render
// JSX (badges) fall back to the raw field, which is plain text anyway.
export function exportCellValue(col, row) {
  if (col.render) {
    const rendered = col.render(row);
    if (typeof rendered === 'string' || typeof rendered === 'number') return rendered;
  }
  return row[col.key] ?? '';
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
