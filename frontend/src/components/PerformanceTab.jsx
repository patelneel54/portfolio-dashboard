import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { C, MONO } from '../styles/theme';
import GuidePanel from './GuidePanel';

export default function PerformanceTab({ holdings, showGuides }) {
  const computeCagr = (gainLossPct, purchaseDate) => {
    if (!purchaseDate) return null;
    const start = new Date(purchaseDate);
    const now = new Date();
    const years = (now - start) / (365.25 * 24 * 60 * 60 * 1000);
    if (years < 0.05) return null; // Less than ~18 days
    const totalReturn = gainLossPct / 100;
    const cagr = (Math.pow(1 + totalReturn, 1 / years) - 1) * 100;
    return cagr;
  };

  const gainLossData = useMemo(() =>
    holdings.map(h => ({
      ticker: h.ticker,
      gain: Math.round(h.gain_loss),
      pct: h.gain_loss_pct.toFixed(1),
      gain_loss_pct: h.gain_loss_pct,
      purchase_date: h.purchase_date,
      color: h.gain_loss >= 0 ? C.green : C.red,
    })).sort((a, b) => b.gain - a.gain), [holdings]);

  const winners = gainLossData.filter(d => d.gain > 0);
  const losers = gainLossData.filter(d => d.gain < 0);
  const totalWins = winners.reduce((s, d) => s + d.gain, 0);
  const totalLosses = Math.abs(losers.reduce((s, d) => s + d.gain, 0));

  return (
    <div>
      {showGuides && <GuidePanel guideKey="gainloss" />}

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Unrealized Gain/Loss - All Positions</h3>
        <ResponsiveContainer width="100%" height={Math.max(300, gainLossData.length * 28)}>
          <BarChart data={gainLossData} layout="vertical" margin={{ left: 50, right: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
            <XAxis type="number" tick={{ fill: C.textDim, fontSize: 10 }} tickFormatter={v => `$${v >= 0 ? '' : '-'}${Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'k' : Math.abs(v)}`} />
            <YAxis type="category" dataKey="ticker" tick={{ fill: C.text, fontSize: 11, fontWeight: 600, fontFamily: MONO }} width={50} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              const cagr = computeCagr(d.gain_loss_pct, d.purchase_date);
              return (
                <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: C.text }}>{d.ticker}</div>
                  <div style={{ color: d.gain >= 0 ? C.green : C.red }}>${d.gain.toLocaleString()} ({d.pct}%)</div>
                  {cagr !== null && (
                    <div style={{ color: C.textDim, fontSize: 11, marginTop: 2 }}>
                      {cagr >= 0 ? '+' : ''}{cagr.toFixed(1)}% annualized
                    </div>
                  )}
                  {!d.purchase_date && (
                    <div style={{ color: C.textDim, fontSize: 10, marginTop: 2, fontStyle: 'italic' }}>Set purchase date for CAGR</div>
                  )}
                </div>
              );
            }} />
            <ReferenceLine x={0} stroke={C.textDim} strokeWidth={2} />
            <Bar dataKey="gain" radius={[0, 6, 6, 0]} barSize={18}>
              {gainLossData.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.75} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div style={{ background: C.greenBg, borderRadius: 12, padding: 16, border: `1px solid ${C.green}33` }}>
          <div style={{ fontSize: 10, color: C.green, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Winners</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.green, fontFamily: MONO, marginTop: 4 }}>{winners.length}</div>
          <div style={{ fontSize: 11, color: C.green + 'aa', marginTop: 2 }}>+${totalWins.toLocaleString()}</div>
        </div>
        <div style={{ background: C.redBg, borderRadius: 12, padding: 16, border: `1px solid ${C.red}33` }}>
          <div style={{ fontSize: 10, color: C.red, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Losers</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.red, fontFamily: MONO, marginTop: 4 }}>{losers.length}</div>
          <div style={{ fontSize: 11, color: C.red + 'aa', marginTop: 2 }}>-${totalLosses.toLocaleString()}</div>
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: 16, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Win Rate</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.amber, fontFamily: MONO, marginTop: 4 }}>
            {gainLossData.length ? ((winners.length / gainLossData.length) * 100).toFixed(0) : 0}%
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{winners.length} of {gainLossData.length} positions</div>
        </div>
      </div>
    </div>
  );
}
