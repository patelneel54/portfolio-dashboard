import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { C, MONO } from '../styles/theme';

function StatCell({ label, value, sub, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '10px 14px', background: C.bg, borderRadius: 8,
      border: `1px solid ${C.border}`, minWidth: 0,
    }}>
      <span style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </span>
      <span style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: color || C.text }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 10, color: C.textDim }}>{sub}</span>}
    </div>
  );
}

const BAR_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
  '#06b6d4', '#84cc16', '#ef4444', '#8b5cf6', '#14b8a6',
];

export default function DividendIntelligence({ dividends }) {
  const summary = dividends?.summary || {};
  const holdings = dividends?.holdings || [];

  const top5 = useMemo(() => holdings.filter(h => h.annual_income > 0).slice(0, 5), [holdings]);

  const incomeBySector = useMemo(() =>
    (summary.income_by_sector || []).filter(s => s.income > 0),
    [summary.income_by_sector]
  );

  const hasIncome = summary.total_annual_income > 0;

  if (!holdings.length) {
    return (
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>Dividend Intelligence</h3>
        <div style={{ color: C.textDim, fontSize: 12, marginTop: 12 }}>No dividend data available yet.</div>
      </div>
    );
  }

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>
        Dividend Intelligence
      </h3>

      {/* Summary stat cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 18 }}>
        <StatCell
          label="Annual Income"
          value={`$${(summary.total_annual_income || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          color={C.green}
        />
        <StatCell
          label="Monthly Income"
          value={`$${(summary.monthly_income || 0).toFixed(0)}`}
          sub="estimated"
          color={C.green}
        />
        <StatCell
          label="Weighted Yield"
          value={`${(summary.weighted_yield || 0).toFixed(2)}%`}
          sub="by market value"
          color={C.cyan}
        />
        <StatCell
          label="Yield on Cost"
          value={`${(summary.weighted_yield_on_cost || 0).toFixed(2)}%`}
          sub="by cost basis"
          color={C.amber}
        />
      </div>

      {/* Income by sector bar chart */}
      {incomeBySector.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, fontWeight: 600 }}>
            Annual Income by Sector
          </div>
          <ResponsiveContainer width="100%" height={Math.max(100, incomeBySector.length * 28)}>
            <BarChart data={incomeBySector} layout="vertical" margin={{ left: 4, right: 20, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }}
                tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`}
              />
              <YAxis
                type="category" dataKey="sector"
                tick={{ fill: C.text, fontSize: 10, fontWeight: 600 }}
                width={100}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: C.text }}>{d.sector}</div>
                      <div style={{ color: C.green, fontFamily: MONO }}>${d.income.toLocaleString(undefined, { maximumFractionDigits: 2 })}/yr</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="income" radius={[0, 6, 6, 0]} barSize={16}>
                {incomeBySector.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top dividend contributors */}
      {top5.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, fontWeight: 600 }}>
            Top Dividend Contributors
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Ticker', 'Annual', 'Yield', 'YoC', 'Sector'].map(h => (
                    <th key={h} style={{
                      padding: '6px 10px', textAlign: 'left',
                      color: C.textDim, fontWeight: 600, fontSize: 10,
                      textTransform: 'uppercase', letterSpacing: 0.8,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top5.map(h => (
                  <tr key={h.ticker} style={{ borderBottom: `1px solid ${C.border}22` }}>
                    <td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: MONO, color: C.text }}>{h.ticker}</td>
                    <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.green }}>
                      ${h.annual_income.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.textMuted }}>
                      {h.dividend_yield.toFixed(2)}%
                    </td>
                    <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.amber }}>
                      {h.yield_on_cost.toFixed(2)}%
                    </td>
                    <td style={{ padding: '6px 10px', fontSize: 11, color: C.textDim }}>
                      {h.sector}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!hasIncome && (
        <div style={{ fontSize: 11, color: C.textDim, fontStyle: 'italic', marginTop: 8 }}>
          No dividend-paying holdings in your portfolio.
        </div>
      )}
    </div>
  );
}
