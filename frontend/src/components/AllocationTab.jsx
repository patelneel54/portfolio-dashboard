import { useMemo } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { C, TYPE_COLORS, MONO } from '../styles/theme';
import PositionConcentration from './PositionConcentration';
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
        {/* Position Concentration */}
        <PositionConcentration holdings={holdings} totalValue={totalValue} />

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
