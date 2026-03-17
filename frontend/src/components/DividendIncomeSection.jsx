import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie } from 'recharts';
import { C, MONO, SANS } from '../styles/theme';
import { cardStyle, tableHeader, badge } from '../styles/shared';
import { api } from '../hooks/useApi';
import { SkeletonCard, SkeletonChart } from './SkeletonLoader';
import { InlineError } from './ErrorBoundary';
import { useIsMobile } from '../hooks/useMediaQuery';

const BAR_COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
  '#06b6d4', '#84cc16', '#ef4444', '#8b5cf6', '#14b8a6',
];

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

const FREQ_LABELS = { 12: 'Monthly', 4: 'Quarterly', 2: 'Semi-Annual', 1: 'Annual' };

export default function DividendIncomeSection({ accountFilter }) {
  const isMobile = useIsMobile();
  const [intelligence, setIntelligence] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('annual_income');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intel, hist] = await Promise.all([
        api.getPortfolioIntelligence(accountFilter),
        api.getDividendHistory(12, accountFilter),
      ]);
      setIntelligence(intel);
      setHistory(hist);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const summary = intelligence?.dividends?.summary || {};
  const holdings = intelligence?.dividends?.holdings || [];
  const incomeBySector = useMemo(() =>
    (summary.income_by_sector || []).filter(s => s.income > 0),
    [summary.income_by_sector]
  );

  const dividendHoldings = useMemo(() => {
    const filtered = holdings.filter(h => h.annual_income > 0);
    return [...filtered].sort((a, b) => {
      if (sortBy === 'dividend_yield') return b.dividend_yield - a.dividend_yield;
      if (sortBy === 'yield_on_cost') return b.yield_on_cost - a.yield_on_cost;
      return b.annual_income - a.annual_income;
    });
  }, [holdings, sortBy]);

  const monthlyData = useMemo(() => {
    if (!history?.months) return [];
    return history.months.map(m => ({
      month: m.month,
      label: new Date(m.month + '-01').toLocaleString('en-US', { month: 'short' }),
      total: m.total,
    }));
  }, [history]);

  if (loading) {
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={70} />)}
        </div>
        <SkeletonChart height={240} />
      </div>
    );
  }

  if (error) {
    return <InlineError message="Failed to load dividend data" onRetry={fetchData} />;
  }

  const hasIncome = summary.total_annual_income > 0;

  if (!hasIncome) {
    return (
      <div style={cardStyle}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.textMuted }}>Dividend Income</h3>
        <div style={{ color: C.textDim, fontSize: 12, marginTop: 12 }}>No dividend-paying holdings in your portfolio.</div>
      </div>
    );
  }

  const sortOptions = [
    { key: 'annual_income', label: 'Income' },
    { key: 'dividend_yield', label: 'Yield' },
    { key: 'yield_on_cost', label: 'YoC' },
  ];

  return (
    <div>
      {/* Summary Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
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
          color={C.amber}
        />
        <StatCell
          label="Yield on Cost"
          value={`${(summary.weighted_yield_on_cost || 0).toFixed(2)}%`}
          sub="by cost basis"
          color={C.cyan}
        />
      </div>

      {/* Monthly Income Bar Chart */}
      {monthlyData.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: C.textMuted }}>
            Monthly Dividend Income
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="4 4" stroke={C.chartGrid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: C.textDim, fontSize: 10 }} />
              <YAxis
                tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }}
                tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)}`}
              />
              <Tooltip cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: C.text }}>{d.month}</div>
                    <div style={{ color: C.green, fontFamily: MONO }}>${d.total.toFixed(2)}</div>
                  </div>
                );
              }} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} barSize={24}>
                {monthlyData.map((_, i) => (
                  <Cell key={i} fill={C.green} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sector Income Donut */}
      {incomeBySector.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: C.textMuted }}>
            Income by Sector
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={incomeBySector}
                  dataKey="income"
                  nameKey="sector"
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={80}
                  paddingAngle={2}
                  stroke="none"
                >
                  {incomeBySector.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  const total = incomeBySector.reduce((s, x) => s + x.income, 0);
                  const pct = total ? ((d.income / total) * 100).toFixed(1) : 0;
                  return (
                    <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: C.text }}>{d.sector}</div>
                      <div style={{ color: C.green, fontFamily: MONO }}>${d.income.toFixed(2)}/yr ({pct}%)</div>
                    </div>
                  );
                }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {incomeBySector.map((s, i) => (
                <div key={s.sector} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: BAR_COLORS[i % BAR_COLORS.length], flexShrink: 0 }} />
                  <span style={{ color: C.textMuted }}>{s.sector}</span>
                  <span style={{ color: C.text, fontFamily: MONO, fontWeight: 600, marginLeft: 'auto' }}>
                    ${s.income.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dividend Scorecard */}
      {dividendHoldings.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.textMuted }}>
              Dividend Scorecard
            </h3>
            <div style={{ display: 'flex', gap: 4 }}>
              {sortOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  style={{
                    background: sortBy === opt.key ? C.accent + '22' : 'transparent',
                    border: `1px solid ${sortBy === opt.key ? C.accent : C.border}`,
                    color: sortBy === opt.key ? C.accent : C.textDim,
                    borderRadius: 4, padding: '3px 8px', fontSize: 10,
                    fontWeight: 600, cursor: 'pointer', minHeight: 28,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {isMobile ? (
            /* Mobile: Card list */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dividendHoldings.map((h, i) => (
                <div key={`${h.ticker}-${i}`} style={{
                  padding: '10px 14px', background: C.bg, borderRadius: 8,
                  border: `1px solid ${h.dividend_yield > 4 ? C.green + '33' : C.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontFamily: MONO, color: C.text, fontSize: 14 }}>{h.ticker}</span>
                    <span style={{ fontFamily: MONO, color: C.green, fontWeight: 700, fontSize: 14 }}>
                      ${h.annual_income.toFixed(0)}/yr
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: C.textMuted }}>
                    <span>Yield <span style={{ color: C.amber, fontFamily: MONO }}>{h.dividend_yield.toFixed(2)}%</span></span>
                    <span>YoC <span style={{ color: C.cyan, fontFamily: MONO }}>{h.yield_on_cost.toFixed(2)}%</span></span>
                    <span style={{ color: C.textDim }}>{h.sector}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Desktop: Table */
            <div data-no-swipe style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Ticker', 'Annual/Share', 'Yield', 'YoC', 'Annual Income', 'Sector'].map(h => (
                      <th key={h} style={tableHeader}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dividendHoldings.map((h, i) => (
                    <tr key={`${h.ticker}-${i}`} style={{
                      borderBottom: `1px solid ${C.border}22`,
                      background: h.dividend_yield > 4 ? C.green + '08' : 'transparent',
                    }}>
                      <td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: MONO, color: C.text }}>{h.ticker}</td>
                      <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.textMuted }}>
                        ${h.annual_dividend_per_share.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.amber }}>
                        {h.dividend_yield.toFixed(2)}%
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.cyan }}>
                        {h.yield_on_cost.toFixed(2)}%
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.green, fontWeight: 700 }}>
                        ${h.annual_income.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '6px 10px', fontSize: 11, color: C.textDim }}>{h.sector}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
