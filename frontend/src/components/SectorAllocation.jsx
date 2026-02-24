import { useState } from 'react';
import { C, MONO } from '../styles/theme';

function RiskBadge({ risk }) {
  if (risk === 'normal') return null;
  const color = risk === 'high' ? C.red : C.amber;
  const label = risk === 'high' ? 'HIGH' : 'ELEVATED';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, fontFamily: MONO,
      color, background: color + '18',
      padding: '2px 6px', borderRadius: 4,
      border: `1px solid ${color}33`,
    }}>
      {label}
    </span>
  );
}

function HHIBadge({ hhi, label }) {
  let color = C.green;
  if (hhi > 2500) color = C.red;
  else if (hhi > 1500) color = C.amber;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', background: C.bg, borderRadius: 8,
      border: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        Sector HHI
      </span>
      <span style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color }}>
        {hhi.toFixed(0)}
      </span>
      <span style={{ fontSize: 10, color, fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

export default function SectorAllocation({ sectors, sectorHhi, sectorHhiLabel }) {
  const [hoveredSector, setHoveredSector] = useState(null);

  if (!sectors?.length) {
    return (
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>Sector Allocation</h3>
        <div style={{ color: C.textDim, fontSize: 12, marginTop: 12 }}>No sector data available yet.</div>
      </div>
    );
  }

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>
        Sector Allocation
      </h3>

      {/* Stacked horizontal bar */}
      <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
        {sectors.map((s) => (
          <div
            key={s.sector}
            onMouseEnter={() => setHoveredSector(s.sector)}
            onMouseLeave={() => setHoveredSector(null)}
            style={{
              width: `${s.percentage}%`,
              background: s.color,
              opacity: hoveredSector && hoveredSector !== s.sector ? 0.35 : 1,
              transition: 'opacity 0.15s, width 0.4s ease',
              minWidth: s.percentage > 2 ? 2 : 0,
              cursor: 'default',
              position: 'relative',
            }}
            title={`${s.sector}: ${s.percentage.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {sectors.map((s) => (
          <span key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.textMuted }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
            {s.sector} {s.percentage.toFixed(1)}%
          </span>
        ))}
      </div>

      {/* Sector table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Sector', '%', 'Value', 'Holdings', 'Risk'].map(h => (
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
            {sectors.map((s) => (
              <tr
                key={s.sector}
                onMouseEnter={() => setHoveredSector(s.sector)}
                onMouseLeave={() => setHoveredSector(null)}
                style={{
                  borderBottom: `1px solid ${C.border}22`,
                  background: hoveredSector === s.sector ? C.border + '44' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <td style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: C.text }}>{s.sector}</span>
                </td>
                <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.text }}>
                  {s.percentage.toFixed(1)}%
                </td>
                <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.textMuted }}>
                  ${s.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td style={{ padding: '6px 10px', fontSize: 11, color: C.textDim }}>
                  {s.tickers.map(t => t.ticker).join(', ')}
                </td>
                <td style={{ padding: '6px 10px' }}>
                  <RiskBadge risk={s.risk} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* HHI Badge */}
      <div style={{ marginTop: 14 }}>
        <HHIBadge hhi={sectorHhi || 0} label={sectorHhiLabel || ''} />
      </div>
    </div>
  );
}
