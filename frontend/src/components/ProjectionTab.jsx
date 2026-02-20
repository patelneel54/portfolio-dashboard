import { useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { C, MONO } from '../styles/theme';
import { projectGrowth } from '../utils/projections';
import GuidePanel from './GuidePanel';

export default function ProjectionTab({ totalValue, settings, showGuides }) {
  const monthly = parseFloat(settings?.monthly_contribution || '500');
  const monthly401k = parseFloat(settings?.monthly_401k_contribution || '0');
  const has401k = monthly401k > 0;
  const [show401k, setShow401k] = useState(false);
  const age = parseInt(settings?.age || '26', 10);
  const conRate = parseFloat(settings?.conservative_rate || '0.06');
  const modRate = parseFloat(settings?.moderate_rate || '0.085');
  const aggRate = parseFloat(settings?.aggressive_rate || '0.11');
  const years = parseInt(settings?.projection_years || '30', 10);

  const effectiveMonthly = show401k ? monthly + monthly401k : monthly;

  const projectionData = useMemo(() => {
    const conservative = projectGrowth(totalValue, effectiveMonthly, years, conRate);
    const moderate = projectGrowth(totalValue, effectiveMonthly, years, modRate);
    const aggressive = projectGrowth(totalValue, effectiveMonthly, years, aggRate);
    return conservative.map((c, i) => ({
      year: c.year,
      conservative: c.value,
      moderate: moderate[i].value,
      aggressive: aggressive[i].value,
    }));
  }, [totalValue, effectiveMonthly, years, conRate, modRate, aggRate]);

  const fmtVal = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}k`;

  const milestones = [
    { label: '5-Year', yr: 5 },
    { label: '10-Year', yr: 10 },
    { label: '20-Year', yr: 20 },
    { label: '30-Year', yr: years },
  ].filter(m => m.yr <= years);

  const startYear = new Date().getFullYear();

  return (
    <div>
      {showGuides && <GuidePanel guideKey="projection" />}

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>Portfolio Growth Projection ({years} Years)</h3>
          {has401k && (
            <button
              onClick={() => setShow401k(v => !v)}
              style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${show401k ? C.purple : C.border}`,
                background: show401k ? C.purple + '22' : 'transparent',
                color: show401k ? C.purple : C.textMuted,
                borderRadius: 6,
              }}
            >
              {show401k ? '401k Included' : 'Include 401k'} (+${monthly401k.toLocaleString()}/mo)
            </button>
          )}
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 11, color: C.textDim }}>
          Starting: {fmtVal(totalValue)} + ${effectiveMonthly.toLocaleString()}/mo
          {show401k ? ` (brokerage $${monthly.toLocaleString()} + 401k $${monthly401k.toLocaleString()})` : ' contributions'}
          {' '}&bull; {(conRate * 100).toFixed(0)}% / {(modRate * 100).toFixed(1)}% / {(aggRate * 100).toFixed(0)}% annual return scenarios
        </p>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={projectionData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
            <defs>
              <linearGradient id="gAgg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
                <stop offset="100%" stopColor={C.green} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gMod" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.blue} stopOpacity={0.3} />
                <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gCon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.amber} stopOpacity={0.2} />
                <stop offset="100%" stopColor={C.amber} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="year" tick={{ fill: C.textDim, fontSize: 10 }} tickFormatter={y => `'${String(y).slice(-2)}`} />
            <YAxis tick={{ fill: C.textDim, fontSize: 10 }} tickFormatter={v => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  <div style={{ color: C.text, fontWeight: 700, marginBottom: 4 }}>Year {label} (Age {age + (label - startYear)})</div>
                  {payload.map((p, i) => (
                    <div key={i} style={{ color: p.color, marginTop: 2 }}>
                      {p.name}: <span style={{ fontWeight: 700 }}>{fmtVal(p.value)}</span>
                    </div>
                  ))}
                </div>
              );
            }} />
            <Area type="monotone" dataKey="aggressive" name={`${(aggRate * 100).toFixed(0)}% (Aggressive)`} stroke={C.green} fill="url(#gAgg)" strokeWidth={2} />
            <Area type="monotone" dataKey="moderate" name={`${(modRate * 100).toFixed(1)}% (Moderate)`} stroke={C.blue} fill="url(#gMod)" strokeWidth={2.5} />
            <Area type="monotone" dataKey="conservative" name={`${(conRate * 100).toFixed(0)}% (Conservative)`} stroke={C.amber} fill="url(#gCon)" strokeWidth={2} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={100000} stroke={C.textDim} strokeDasharray="5 5" label={{ value: '$100k', position: 'left', fill: C.textDim, fontSize: 10 }} />
            <ReferenceLine y={500000} stroke={C.textDim} strokeDasharray="5 5" label={{ value: '$500k', position: 'left', fill: C.textDim, fontSize: 10 }} />
            <ReferenceLine y={1000000} stroke={C.amber} strokeDasharray="5 5" label={{ value: '$1M', position: 'left', fill: C.amber, fontSize: 11, fontWeight: 700 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Milestone Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${milestones.length}, 1fr)`, gap: 12 }}>
        {milestones.map(m => {
          const d = projectionData.find(p => p.year === startYear + m.yr);
          if (!d) return null;
          return (
            <div key={m.yr} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{m.label} (Age {age + m.yr})</div>
              <div style={{ fontSize: 11, color: C.amber, marginTop: 8, fontFamily: MONO }}>Low: {fmtVal(d.conservative)}</div>
              <div style={{ fontSize: 16, color: C.blue, fontWeight: 800, fontFamily: MONO }}>Mid: {fmtVal(d.moderate)}</div>
              <div style={{ fontSize: 11, color: C.green, marginTop: 2, fontFamily: MONO }}>High: {fmtVal(d.aggressive)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
