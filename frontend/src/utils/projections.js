export function projectGrowth(startValue, monthlyAdd, years, annualReturn) {
  const monthlyRate = annualReturn / 12;
  const points = [];
  let val = startValue;
  for (let m = 0; m <= years * 12; m++) {
    if (m % 12 === 0) {
      points.push({ year: new Date().getFullYear() + m / 12, value: Math.round(val) });
    }
    val = val * (1 + monthlyRate) + monthlyAdd;
  }
  return points;
}

export function formatCurrency(val) {
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

export function formatPct(val) {
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
}
