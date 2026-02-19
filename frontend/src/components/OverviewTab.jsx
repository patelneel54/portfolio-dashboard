import { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { C, TICKER_COLORS, MONO } from '../styles/theme';

const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
      {label && <div style={{ color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.text, marginTop: 2 }}>
          {p.name}: <span style={{ fontWeight: 700 }}>{typeof p.value === 'number' ? (Math.abs(p.value) >= 1000 ? `$${(p.value / 1000).toFixed(1)}k` : `$${p.value}`) : p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function OverviewTab({ holdings, totalValue }) {
  const allocationData = useMemo(() =>
    [...holdings].sort((a, b) => b.market_value - a.market_value).map((h, i) => ({
      name: h.ticker,
      value: h.market_value,
      type: h.type,
      pct: ((h.market_value / totalValue) * 100).toFixed(1),
      color: TICKER_COLORS[i % TICKER_COLORS.length],
    })), [holdings, totalValue]);

  const gainLossData = useMemo(() =>
    holdings.map(h => ({
      ticker: h.ticker,
      gain: Math.round(h.gain_loss),
      pct: h.gain_loss_pct.toFixed(1),
      color: h.gain_loss >= 0 ? C.green : C.red,
    })).sort((a, b) => b.gain - a.gain), [holdings]);

  const driftData = useMemo(() =>
    [...holdings].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 8), [holdings]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Allocation Pie */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Allocation by Position</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} innerRadius={55} paddingAngle={1.5} stroke={C.bg} strokeWidth={2}>
                {allocationData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: C.text }}>{d.name} ({d.type})</div>
                    <div style={{ color: C.textMuted }}>${d.value.toLocaleString()} &bull; {d.pct}%</div>
                  </div>
                );
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, justifyContent: 'center' }}>
            {allocationData.slice(0, 10).map(d => (
              <span key={d.name} style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, display: 'inline-block' }} />
                {d.name} {d.pct}%
              </span>
            ))}
          </div>
        </div>

        {/* Top Movers */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Top Movers (Gain/Loss $)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={gainLossData.slice(0, 10)} layout="vertical" margin={{ left: 40, right: 20 }}>
              <XAxis type="number" tick={{ fill: C.textDim, fontSize: 10 }} tickFormatter={v => `$${v >= 0 ? '' : '-'}${Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'k' : Math.abs(v)}`} />
              <YAxis type="category" dataKey="ticker" tick={{ fill: C.text, fontSize: 11, fontWeight: 600 }} width={45} />
              <Tooltip content={DarkTooltip} />
              <ReferenceLine x={0} stroke={C.textDim} />
              <Bar dataKey="gain" radius={[0, 4, 4, 0]} barSize={16}>
                {gainLossData.slice(0, 10).map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.8} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drift Table */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Portfolio Drift - Biggest Misallocations</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {driftData.map(h => {
            const isOver = h.drift > 0;
            return (
              <div key={h.ticker} style={{ padding: '10px 14px', background: '#0d1424', borderRadius: 8, border: `1px solid ${isOver ? C.red + '33' : C.green + '33'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, fontFamily: MONO }}>{h.ticker}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isOver ? C.red : C.green, fontFamily: MONO }}>
                    {isOver ? '+' : ''}{h.drift.toFixed(1)}%
                  </span>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
                  {h.actual_allocation.toFixed(1)}% actual &rarr; {h.target_allocation.toFixed(1)}% target
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
