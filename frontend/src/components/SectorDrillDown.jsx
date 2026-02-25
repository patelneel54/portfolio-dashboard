import { C, MONO } from '../styles/theme';

const StatCard = ({ label, value, sub, color }) => (
  <div style={{
    padding: '14px 18px', background: C.bg, borderRadius: 10,
    border: `1px solid ${C.border}`, flex: 1, minWidth: 120,
  }}>
    <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, fontFamily: MONO, color: color || C.text, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
  </div>
);

const fmtPct = (v) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';
const fmtNum = (v, d = 2) => v != null ? v.toFixed(d) : 'N/A';

export default function SectorDrillDown({ sectorData, onDrillToStock, onBack }) {
  if (!sectorData) return null;

  const { sector, value, percentage, weighted_beta, weighted_pe, return_contribution, holdings, color } = sectorData;

  return (
    <div>
      {/* Sector header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>{sector}</h3>
        <span style={{ fontSize: 12, color: C.textMuted, fontFamily: MONO }}>{percentage.toFixed(1)}% of portfolio</span>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
        <StatCard label="Total Value" value={`$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatCard label="Weighted Beta" value={fmtNum(weighted_beta)} color={weighted_beta && weighted_beta > 1.2 ? C.amber : C.text} />
        <StatCard label="Weighted P/E" value={fmtNum(weighted_pe, 1)} />
        <StatCard
          label="Return Contrib"
          value={`${return_contribution >= 0 ? '+' : ''}${return_contribution.toFixed(2)}%`}
          color={return_contribution >= 0 ? C.green : C.red}
        />
        <StatCard label="Holdings" value={holdings.length} />
      </div>

      {/* Holdings table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Ticker', 'Weight', 'Return', 'Contribution', 'Beta', 'P/E', 'Earnings Gr.', 'Rev. Growth', 'Div Yield', '% Portfolio'].map(h => (
                <th key={h} style={{
                  padding: '6px 8px', textAlign: 'left',
                  color: C.textDim, fontWeight: 600, fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holdings
              .sort((a, b) => b.weight - a.weight)
              .map((h) => (
                <tr
                  key={h.ticker}
                  onClick={() => onDrillToStock({ type: 'stock', ticker: h.ticker, sector })}
                  style={{
                    borderBottom: `1px solid ${C.border}22`,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.border + '44'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '8px', fontWeight: 700, fontFamily: MONO, color: C.accent }}>
                    {h.ticker}
                  </td>
                  <td style={{ padding: '8px', fontFamily: MONO, color: C.text }}>
                    {h.weight.toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px', fontFamily: MONO, color: h.gain_loss_pct >= 0 ? C.green : C.red }}>
                    {h.gain_loss_pct >= 0 ? '+' : ''}{h.gain_loss_pct.toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px', fontFamily: MONO, color: h.return_contribution >= 0 ? C.green : C.red }}>
                    {h.return_contribution >= 0 ? '+' : ''}{h.return_contribution.toFixed(3)}%
                  </td>
                  <td style={{ padding: '8px', fontFamily: MONO, color: C.textMuted }}>
                    {fmtNum(h.beta)}
                  </td>
                  <td style={{ padding: '8px', fontFamily: MONO, color: C.textMuted }}>
                    {fmtNum(h.trailing_pe, 1)}
                  </td>
                  <td style={{ padding: '8px', fontFamily: MONO, color: C.textMuted }}>
                    {fmtPct(h.earnings_growth)}
                  </td>
                  <td style={{ padding: '8px', fontFamily: MONO, color: C.textMuted }}>
                    {fmtPct(h.revenue_growth)}
                  </td>
                  <td style={{ padding: '8px', fontFamily: MONO, color: C.textMuted }}>
                    {h.dividend_yield != null ? h.dividend_yield.toFixed(2) + '%' : 'N/A'}
                  </td>
                  <td style={{ padding: '8px', fontFamily: MONO, color: C.text }}>
                    {h.weight.toFixed(1)}%
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
