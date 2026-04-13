export function fmtPct(value, { signed = false, digits = 1 } = {}) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = signed && value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function fmtCurrency(value, { digits = 0, signed = false } = {}) {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = signed && value >= 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function fmtCompact(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}
