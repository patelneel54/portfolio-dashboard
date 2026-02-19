import { useMemo } from 'react';
import { Treemap, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { C, TYPE_COLORS, MONO } from '../styles/theme';
import GuidePanel from './GuidePanel';

const DarkTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.text, marginTop: 2 }}>
          {p.name}: <span style={{ fontWeight: 700 }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

export default function AllocationTab({ holdings, totalValue, showGuides }) {
  const treemapData = useMemo(() =>
    [...holdings].sort((a, b) => b.market_value - a.market_value).map(h => ({
      name: h.ticker,
      value: h.market_value,
      type: h.type,
      pct: ((h.market_value / totalValue) * 100).toFixed(1),
      dayChange: h.day_change_pct || 0,
    })), [holdings, totalValue]);

  const radarData = useMemo(() => {
    const top = [...holdings]
      .filter(h => h.target_allocation > 1.5 || h.actual_allocation > 3)
      .sort((a, b) => b.market_value - a.market_value)
      .slice(0, 12);
    return top.map(h => ({
      ticker: h.ticker,
      actual: +(h.actual_allocation || 0).toFixed(1),
      target: +(h.target_allocation || 0).toFixed(1),
    }));
  }, [holdings]);

  const sortedByDrift = useMemo(() =>
    [...holdings].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)), [holdings]);

  return (
    <div>
      {showGuides && <GuidePanel guideKey="allocation" />}
      {showGuides && <GuidePanel guideKey="targetRadar" />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* Treemap */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Position Size Treemap</h3>
          {treemapData.length > 0 && (
          <ResponsiveContainer width="100%" height={380}>
            <Treemap data={treemapData} dataKey="value" nameKey="name" stroke={C.bg} strokeWidth={3} animationDuration={300}
              content={({ x, y, width, height, name, pct, dayChange, depth }) => {
                if (!width || !height || depth < 1 || !name) return <g />;
                const change = typeof dayChange === 'number' ? dayChange : 0;
                const isUp = change >= 0;
                const fillBg = isUp ? '#0d503d' : '#6b1c1c';
                const borderColor = isUp ? '#34d399' : '#f87171';
                if (width < 30 || height < 25) return <g><rect x={x + 1.5} y={y + 1.5} width={Math.max(0, width - 3)} height={Math.max(0, height - 3)} fill={fillBg} stroke={borderColor} strokeWidth={1} rx={6} /></g>;
                const showChange = width > 55 && height > 50;
                return (
                  <g>
                    <rect x={x + 1.5} y={y + 1.5} width={Math.max(0, width - 3)} height={Math.max(0, height - 3)} fill={fillBg} stroke={borderColor} strokeWidth={1} rx={6} />
                    <text x={x + width / 2} y={y + height / 2 - (showChange ? 10 : 2)} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={11} fontWeight={300} fontFamily={MONO}>{name}</text>
                    <text x={x + width / 2} y={y + height / 2 + (showChange ? 6 : 14)} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={11} fontWeight={300} fontFamily={MONO}>{pct != null ? pct : ''}%</text>
                    {showChange && <text x={x + width / 2} y={y + height / 2 + 22} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={12} fontWeight={10} fontFamily={MONO}>{isUp ? '+' : ''}{change.toFixed(1)}%</text>}
                  </g>
                );
              }}
            />
          </ResponsiveContainer>
          )}
          <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: 11, color: C.textMuted }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: '#0d503d', border: '1px solid #34d399', borderRadius: 3 }} /> Up today</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, background: '#6b1c1c', border: '1px solid #f87171', borderRadius: 3 }} /> Down today</span>
          </div>
        </div>

        {/* Radar */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Target vs Actual Allocation</h3>
          <ResponsiveContainer width="100%" height={340}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="72%">
              <PolarGrid stroke={C.border} />
              <PolarAngleAxis dataKey="ticker" tick={{ fill: C.text, fontSize: 11, fontWeight: 600 }} />
              <PolarRadiusAxis tick={{ fill: C.textDim, fontSize: 9 }} domain={[0, 'auto']} />
              <Radar name="Target" dataKey="target" stroke={C.green} fill={C.green} fillOpacity={0.15} strokeWidth={2} />
              <Radar name="Actual" dataKey="actual" stroke={C.blue} fill={C.blue} fillOpacity={0.15} strokeWidth={2} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip content={DarkTooltip} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Full Holdings Table */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>All Holdings - Sorted by Drift</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Ticker', 'Type', 'Shares', 'Avg Cost', 'Current', 'Value', 'G/L $', 'G/L %', 'Actual %', 'Target %', 'Drift'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: C.textDim, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedByDrift.map(h => (
                <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: MONO }}>{h.ticker}</td>
                  <td style={{ padding: '8px 10px' }}><span style={{ color: TYPE_COLORS[h.type], fontSize: 10, fontWeight: 600 }}>{h.type}</span></td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>{h.shares}</td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>${(h.avg_cost || 0).toFixed(0)}</td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO }}>${(h.current_price || h.avg_cost || 0).toFixed(0)}</td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO }}>${(h.market_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO, color: (h.gain_loss || 0) >= 0 ? C.green : C.red }}>{(h.gain_loss || 0) >= 0 ? '+' : ''}${(h.gain_loss || 0).toFixed(0)}</td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO, color: (h.gain_loss_pct || 0) >= 0 ? C.green : C.red }}>{(h.gain_loss_pct || 0) >= 0 ? '+' : ''}{(h.gain_loss_pct || 0).toFixed(1)}%</td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO }}>{(h.actual_allocation || 0).toFixed(1)}%</td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>{(h.target_allocation || 0).toFixed(1)}%</td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO, fontWeight: 700, color: Math.abs(h.drift || 0) < 0.5 ? C.textDim : (h.drift || 0) > 0 ? C.red : C.green }}>
                    {(h.drift || 0) > 0 ? '+' : ''}{(h.drift || 0).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
