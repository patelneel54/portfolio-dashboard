import { C, MONO } from '../styles/theme';

const fmtPct = (v) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';
const fmtNum = (v, d = 2) => v != null ? v.toFixed(d) : 'N/A';

export default function SectorDrillDown({ sectorData, onDrillToStock, onBack }) {
  if (!sectorData) return null;

  const { sector, value, percentage, weighted_beta, weighted_pe, return_contribution, holdings, color } = sectorData;

  const stats = [
    { label: 'Total Value', value: `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
    { label: 'Weighted Beta', value: fmtNum(weighted_beta), color: weighted_beta && weighted_beta > 1.2 ? C.amber : C.text },
    { label: 'Weighted P/E', value: fmtNum(weighted_pe, 1) },
    { label: 'Return Contrib', value: `${return_contribution >= 0 ? '+' : ''}${return_contribution.toFixed(2)}%`, color: return_contribution >= 0 ? C.green : C.red },
    { label: 'Holdings', value: holdings.length },
  ];

  return (
    <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Sector header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block', flexShrink: 0 }} />
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>{sector}</h3>
        <span style={{ fontSize: 12, color: C.textMuted, fontFamily: MONO }}>{percentage.toFixed(1)}% of portfolio</span>
      </div>

      {/* Summary stats — 2-column grid on mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            padding: '12px 14px', background: C.bg, borderRadius: 10,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: s.color || C.text, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Holdings — mobile card layout */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {holdings
          .sort((a, b) => b.weight - a.weight)
          .map((h) => (
            <div
              key={h.id || h.ticker}
              onClick={() => onDrillToStock({ type: 'stock', ticker: h.ticker, sector })}
              style={{
                padding: '12px 14px', background: C.bg, borderRadius: 10,
                border: `1px solid ${C.border}`, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {/* Row 1: ticker + return */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontFamily: MONO, color: C.accent, fontSize: 14 }}>{h.ticker}</span>
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14, color: h.gain_loss_pct >= 0 ? C.green : C.red }}>
                  {h.gain_loss_pct >= 0 ? '+' : ''}{h.gain_loss_pct.toFixed(1)}%
                </span>
              </div>
              {/* Row 2: detail chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 10, color: C.textMuted }}>
                <span>Wt <span style={{ color: C.text, fontFamily: MONO, fontWeight: 600 }}>{h.weight.toFixed(1)}%</span></span>
                <span>Contrib <span style={{ color: h.return_contribution >= 0 ? C.green : C.red, fontFamily: MONO, fontWeight: 600 }}>{h.return_contribution >= 0 ? '+' : ''}{h.return_contribution.toFixed(3)}%</span></span>
                {h.beta != null && <span>β <span style={{ fontFamily: MONO }}>{h.beta.toFixed(2)}</span></span>}
                {h.trailing_pe != null && <span>P/E <span style={{ fontFamily: MONO }}>{h.trailing_pe.toFixed(1)}</span></span>}
                {h.dividend_yield != null && <span>Div <span style={{ fontFamily: MONO }}>{h.dividend_yield.toFixed(2)}%</span></span>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
