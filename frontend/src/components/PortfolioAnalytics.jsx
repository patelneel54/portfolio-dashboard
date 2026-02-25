import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis } from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import SectorDrillDown from './SectorDrillDown';
import StockDeepDive from './StockDeepDive';

// ── Shared sub-components ──

function AnalyticsBadge({ type }) {
  const config = {
    CONCENTRATION: { color: C.red, label: 'CONCENTRATION' },
    ELEVATED: { color: C.amber, label: 'ELEVATED' },
    MODERATE: { color: C.cyan, label: 'MODERATE' },
  };
  const c = config[type];
  if (!c) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, fontFamily: MONO,
      color: c.color, background: c.color + '18',
      padding: '2px 6px', borderRadius: 4,
      border: `1px solid ${c.color}33`,
    }}>
      {c.label}
    </span>
  );
}

function HHIBadge({ hhi }) {
  let color = C.green;
  let label = 'Diversified';
  if (hhi > 2500) { color = C.red; label = 'High concentration'; }
  else if (hhi > 1500) { color = C.amber; label = 'Moderate concentration'; }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', background: C.bg, borderRadius: 8,
      border: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        Sector HHI
      </span>
      <span style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color }}>{hhi.toFixed(0)}</span>
      <span style={{ fontSize: 10, color, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

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

// ── Breadcrumb ──

function Breadcrumb({ drillView, onNavigate }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, fontSize: 11 }}>
      <span
        onClick={() => onNavigate(null)}
        style={{ cursor: drillView ? 'pointer' : 'default', color: drillView ? C.accent : C.text, fontWeight: 600 }}
      >
        Portfolio Analytics
      </span>
      {drillView?.type === 'sector' && (
        <>
          <span style={{ color: C.textDim }}>/</span>
          <span style={{ color: C.text, fontWeight: 600 }}>{drillView.name}</span>
        </>
      )}
      {drillView?.type === 'stock' && (
        <>
          <span style={{ color: C.textDim }}>/</span>
          <span
            onClick={() => onNavigate({ type: 'sector', name: drillView.sector })}
            style={{ cursor: 'pointer', color: C.accent, fontWeight: 600 }}
          >
            {drillView.sector}
          </span>
          <span style={{ color: C.textDim }}>/</span>
          <span style={{ color: C.text, fontWeight: 600, fontFamily: MONO }}>{drillView.ticker}</span>
        </>
      )}
    </div>
  );
}

// ── Sub-tab: Sectors ──

function SectorsSubTab({ sectors, onDrill }) {
  const [hoveredSector, setHoveredSector] = useState(null);

  return (
    <div>
      {/* Stacked horizontal bar */}
      <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
        {sectors.map((s) => (
          <div
            key={s.sector}
            onMouseEnter={() => setHoveredSector(s.sector)}
            onMouseLeave={() => setHoveredSector(null)}
            onClick={() => onDrill({ type: 'sector', name: s.sector })}
            style={{
              width: `${s.percentage}%`, background: s.color,
              opacity: hoveredSector && hoveredSector !== s.sector ? 0.35 : 1,
              transition: 'opacity 0.15s', minWidth: s.percentage > 2 ? 2 : 0,
              cursor: 'pointer',
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

      {/* Enhanced sector table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Sector', '%', 'Value', 'Wtd Beta', 'Wtd P/E', 'Return Contrib', 'Holdings', 'Risk'].map(h => (
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
            {sectors.map((s) => (
              <tr
                key={s.sector}
                onClick={() => onDrill({ type: 'sector', name: s.sector })}
                style={{
                  borderBottom: `1px solid ${C.border}22`,
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.border + '44'; setHoveredSector(s.sector); }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; setHoveredSector(null); }}
              >
                <td style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: C.text }}>{s.sector}</span>
                </td>
                <td style={{ padding: '6px 8px', fontFamily: MONO, color: C.text }}>{s.percentage.toFixed(1)}%</td>
                <td style={{ padding: '6px 8px', fontFamily: MONO, color: C.textMuted }}>
                  ${s.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td style={{ padding: '6px 8px', fontFamily: MONO, color: s.weighted_beta && s.weighted_beta > 1.2 ? C.amber : C.textMuted }}>
                  {s.weighted_beta?.toFixed(2) || 'N/A'}
                </td>
                <td style={{ padding: '6px 8px', fontFamily: MONO, color: C.textMuted }}>
                  {s.weighted_pe?.toFixed(1) || 'N/A'}
                </td>
                <td style={{ padding: '6px 8px', fontFamily: MONO, color: s.return_contribution >= 0 ? C.green : C.red }}>
                  {s.return_contribution >= 0 ? '+' : ''}{s.return_contribution.toFixed(2)}%
                </td>
                <td style={{ padding: '6px 8px', fontFamily: MONO, color: C.textMuted }}>{s.holdings_count}</td>
                <td style={{ padding: '6px 8px' }}>
                  <AnalyticsBadge type={s.risk} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sub-tab: Contributions ──

function ContributionsSubTab({ holdings, sectors }) {
  const sectorContribData = useMemo(() => {
    const map = {};
    holdings.forEach(h => {
      if (!map[h.sector]) map[h.sector] = { name: h.sector, contrib: 0 };
      map[h.sector].contrib += h.return_contribution;
    });
    return Object.values(map)
      .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))
      .map(s => ({ ...s, contrib: +s.contrib.toFixed(3) }));
  }, [holdings]);

  const topSector = sectorContribData[0];

  return (
    <div>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16 }}>
        Return contribution per sector (Weight × Return). Shows what's actually driving your portfolio.
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, sectorContribData.length * 32)}>
        <BarChart data={sectorContribData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
          <XAxis
            type="number"
            tick={{ fill: C.textDim, fontSize: 9, fontFamily: MONO }}
            axisLine={false} tickLine={false}
            tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
          />
          <YAxis
            type="category" dataKey="name"
            tick={{ fill: C.textMuted, fontSize: 11 }}
            axisLine={false} tickLine={false}
            width={130}
          />
          <Tooltip
            contentStyle={{ background: '#0f1729', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontFamily: MONO }}
            formatter={v => [`${v >= 0 ? '+' : ''}${v.toFixed(3)}%`, 'Contribution']}
          />
          <Bar dataKey="contrib" radius={[0, 4, 4, 0]}>
            {sectorContribData.map(entry => (
              <Cell key={entry.name} fill={entry.contrib >= 0 ? C.green : C.red} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {topSector && (
        <div style={{
          marginTop: 16, padding: '10px 14px',
          background: C.green + '0d', border: `1px solid ${C.green}33`, borderRadius: 8,
        }}>
          <div style={{ fontSize: 10, color: C.green, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
            Contribution Insight
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
            <strong style={{ color: C.text }}>{topSector.name}</strong> contributes{' '}
            <span style={{ color: topSector.contrib >= 0 ? C.green : C.red, fontFamily: MONO, fontWeight: 700 }}>
              {topSector.contrib >= 0 ? '+' : ''}{topSector.contrib.toFixed(2)}%
            </span>{' '}
            to total portfolio return — the single largest sector driver.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Factors ──

function FactorsSubTab({ factors }) {
  const pe = factors.weighted_pe || 15;
  const beta = factors.weighted_beta || 1;
  const divYield = factors.weighted_dividend_yield || 0;

  const growthScore = Math.min(100, Math.max(0, (pe - 10) * 2.5));
  const radarData = [
    { factor: 'Growth', value: +growthScore.toFixed(0) },
    { factor: 'Value', value: +(100 - growthScore).toFixed(0) },
    { factor: 'Quality', value: +Math.max(0, 100 - Math.abs(beta - 1) * 50).toFixed(0) },
    { factor: 'Momentum', value: +Math.min(100, beta * 50).toFixed(0) },
    { factor: 'Low Vol', value: +Math.max(0, 100 - beta * 40).toFixed(0) },
    { factor: 'Yield', value: +Math.min(100, divYield * 15).toFixed(0) },
  ];

  const capBreakdown = [
    { label: 'Large Cap', pct: factors.large_cap_pct || 0, color: C.accent },
    { label: 'Mid Cap', pct: factors.mid_cap_pct || 0, color: C.cyan },
    { label: 'Small Cap', pct: factors.small_cap_pct || 0, color: C.amber },
    { label: 'Unclassified', pct: factors.unclassified_pct || 0, color: C.textDim },
  ].filter(c => c.pct > 0);

  const styleTilt = pe > 25
    ? [{ label: 'Growth', pct: 55, color: C.purple }, { label: 'Blend', pct: 35, color: C.accent }, { label: 'Value', pct: 10, color: C.green }]
    : pe < 16
    ? [{ label: 'Growth', pct: 15, color: C.purple }, { label: 'Blend', pct: 30, color: C.accent }, { label: 'Value', pct: 55, color: C.green }]
    : [{ label: 'Growth', pct: 35, color: C.purple }, { label: 'Blend', pct: 45, color: C.accent }, { label: 'Value', pct: 20, color: C.green }];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Left: Radar */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
          Factor Exposure
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <RadarChart data={radarData}>
            <PolarGrid stroke={C.border} />
            <PolarAngleAxis dataKey="factor" tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }} />
            <Radar dataKey="value" stroke={C.accent} fill={C.accent} fillOpacity={0.2} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Right: Cap + Style bars */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
          Market Cap Breakdown
        </div>
        {capBreakdown.map(c => (
          <div key={c.label} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: C.textMuted }}>{c.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: c.color }}>{c.pct.toFixed(1)}%</span>
            </div>
            <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${c.pct}%`, height: '100%', background: c.color, borderRadius: 3, transition: 'width 0.6s ease' }} />
            </div>
          </div>
        ))}

        <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 20, marginBottom: 12 }}>
          Style Tilt
        </div>
        {styleTilt.map(s => (
          <div key={s.label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: C.textMuted }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: s.color }}>{s.pct}%</span>
            </div>
            <div style={{ height: 4, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${s.pct}%`, height: '100%', background: s.color, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-tab: Risk ──

function RiskSubTab({ risk, sectors }) {
  const sortedSectors = useMemo(() =>
    [...sectors].sort((a, b) => b.percentage - a.percentage),
    [sectors]
  );
  const maxSector = sortedSectors[0];
  const maxPct = maxSector?.percentage || 1;
  const breachingSectors = sortedSectors.filter(s => s.percentage > 25);

  const riskRows = [
    {
      label: 'Portfolio Beta',
      value: risk.portfolio_beta?.toFixed(2) || 'N/A',
      ok: !risk.portfolio_beta || risk.portfolio_beta <= 1.2,
      status: risk.portfolio_beta > 1.2 ? '⚠ Above market' : '✓ Controlled',
      statusColor: risk.portfolio_beta > 1.2 ? C.amber : C.green,
    },
    {
      label: 'Top 3 Concentration',
      value: `${risk.top_3_concentration?.toFixed(1) || 0}%`,
      sub: risk.top_3_tickers?.join(', '),
      ok: !risk.top_3_concentration || risk.top_3_concentration <= 40,
      status: risk.top_3_concentration > 40 ? '⚠ Concentrated' : '✓ Diversified',
      statusColor: risk.top_3_concentration > 40 ? C.red : C.green,
    },
    {
      label: 'Max Sector Weight',
      value: maxSector ? `${maxSector.percentage.toFixed(1)}%` : 'N/A',
      sub: maxSector?.sector,
      ok: !maxSector || maxSector.percentage <= 25,
      status: maxSector?.percentage > 25 ? '⚠ Concentration flag' : '✓ Within bounds',
      statusColor: maxSector?.percentage > 25 ? C.amber : C.green,
    },
    {
      label: 'VaR (95%, 1-Day)',
      value: risk.var_95_1day ? `$${risk.var_95_1day.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'N/A',
      sub: 'Max expected daily loss',
      ok: null,
      status: 'Risk estimate',
      statusColor: C.red,
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Left: Risk Engine */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
          Risk Engine
        </div>
        {riskRows.map((row, i) => (
          <div
            key={row.label}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '11px 0',
              borderBottom: i < riskRows.length - 1 ? `1px solid ${C.border}` : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 2 }}>{row.label}</div>
              {row.sub && <div style={{ fontSize: 10, color: C.textDim, fontFamily: MONO }}>{row.sub}</div>}
              <div style={{ fontSize: 10, color: row.statusColor, marginTop: 2 }}>{row.status}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: MONO, color: C.text }}>{row.value}</div>
          </div>
        ))}
      </div>

      {/* Right: Sector concentration bars */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
          Sector Concentration
        </div>
        {sortedSectors.map(s => (
          <div key={s.sector} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>{s.sector}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 11, fontFamily: MONO, color: s.percentage > 25 ? C.red : C.textDim }}>
                  {s.percentage.toFixed(1)}%
                </span>
                {s.percentage > 25 && <span style={{ fontSize: 9, color: C.red }}>⚠</span>}
              </div>
            </div>
            <div style={{ height: 4, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${(s.percentage / maxPct) * 100}%`,
                height: '100%',
                background: s.percentage > 25 ? C.red : s.color,
                borderRadius: 3,
                opacity: 0.8,
              }} />
            </div>
          </div>
        ))}

        {breachingSectors.length > 0 && (
          <div style={{
            marginTop: 14, padding: '8px 12px',
            background: C.amber + '0d', border: `1px solid ${C.amber}33`, borderRadius: 6,
            fontSize: 11, color: C.amber, lineHeight: 1.5,
          }}>
            ⚠ {breachingSectors.map(s => `${s.sector} (${s.percentage.toFixed(1)}%)`).join(', ')} exceed{breachingSectors.length === 1 ? 's' : ''} the 25% concentration threshold.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

const SUB_TABS = [
  { id: 'sectors', label: 'Sectors' },
  { id: 'contributions', label: 'Contributions' },
  { id: 'factors', label: 'Factors' },
  { id: 'risk', label: 'Risk' },
];

export default function PortfolioAnalytics({ accountFilter }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('sectors');
  const [drillView, setDrillView] = useState(null); // null | {type:'sector', name} | {type:'stock', ticker, sector}

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPortfolioAnalytics(accountFilter);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to fetch portfolio analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [accountFilter]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Reset drill view when account filter changes
  useEffect(() => {
    setDrillView(null);
  }, [accountFilter]);

  if (loading) {
    return (
      <div style={{
        background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
        padding: 40, textAlign: 'center',
      }}>
        <div style={{ color: C.textDim, fontSize: 12 }}>Loading analytics...</div>
      </div>
    );
  }

  if (!analytics || !analytics.sectors_detail?.length) {
    return (
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>Portfolio Analytics</h3>
        <div style={{ color: C.textDim, fontSize: 12, marginTop: 12 }}>No analytics data available yet.</div>
      </div>
    );
  }

  const { sectors_detail, holdings_detail, portfolio_risk, factors, total_value } = analytics;

  // Drill-down data resolution
  const drillSector = drillView?.type === 'sector'
    ? sectors_detail.find(s => s.sector === drillView.name)
    : null;

  const drillStock = drillView?.type === 'stock'
    ? holdings_detail.find(h => h.ticker === drillView.ticker)
    : null;

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
      {/* Breadcrumb */}
      <Breadcrumb drillView={drillView} onNavigate={setDrillView} />

      {/* Level 2: Sector drill-down */}
      {drillView?.type === 'sector' && drillSector && (
        <SectorDrillDown
          sectorData={drillSector}
          onDrillToStock={setDrillView}
          onBack={() => setDrillView(null)}
        />
      )}

      {/* Level 3: Stock deep dive */}
      {drillView?.type === 'stock' && drillStock && (
        <StockDeepDive
          holdingDetail={drillStock}
          portfolioBeta={portfolio_risk.portfolio_beta}
          totalValue={total_value}
          onBack={() => setDrillView(drillView.sector ? { type: 'sector', name: drillView.sector } : null)}
        />
      )}

      {/* Level 1: Sub-tabs */}
      {!drillView && (
        <>
          {/* Sub-tab bar */}
          <div style={{
            display: 'flex', gap: 2, marginBottom: 16, background: C.bg, borderRadius: 8,
            padding: 3, border: `1px solid ${C.border}`, width: 'fit-content',
          }}>
            {SUB_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  background: activeSubTab === tab.id ? C.accent : 'transparent',
                  color: activeSubTab === tab.id ? '#fff' : C.textMuted,
                  transition: 'all 0.2s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sub-tab content */}
          {activeSubTab === 'sectors' && (
            <SectorsSubTab sectors={sectors_detail} onDrill={setDrillView} />
          )}
          {activeSubTab === 'contributions' && (
            <ContributionsSubTab holdings={holdings_detail} sectors={sectors_detail} />
          )}
          {activeSubTab === 'factors' && (
            <FactorsSubTab factors={factors} holdings={holdings_detail} />
          )}
          {activeSubTab === 'risk' && (
            <RiskSubTab risk={portfolio_risk} sectors={sectors_detail} />
          )}
        </>
      )}
    </div>
  );
}
