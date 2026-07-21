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

export function daysBetween(from, to = new Date()) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return 0;
  return Math.floor((b.setHours(0, 0, 0, 0) - a.setHours(0, 0, 0, 0)) / 86400000);
}

export function agingBucket(overdueDays) {
  if (overdueDays <= 0) return 'Current';
  if (overdueDays <= 30) return '1-30 Days';
  if (overdueDays <= 60) return '31-60 Days';
  if (overdueDays <= 90) return '61-90 Days';
  return '90+ Days';
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
