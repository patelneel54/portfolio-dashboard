import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { cardStyle, badge, labelStyle } from '../styles/shared';
import { api } from '../hooks/useApi';
import { SkeletonCard } from './SkeletonLoader';
import { InlineError } from './ErrorBoundary';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useIsMobile } from '../hooks/useMediaQuery';

const FILTERS = [
  { id: 'all', label: 'All Events' },
  { id: 'ex-dividend', label: 'Ex-Dates' },
  { id: 'est-payment', label: 'Est. Payments' },
];

const BAR_COLORS = [C.green, C.accent, C.amber, C.cyan, C.purple, C.pink];

function formatShortDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Stat Cell ── */
function StatCell({ label, value, color, sub }) {
  return (
    <div style={{
      background: C.bg, borderRadius: 10, padding: '12px 14px',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{ ...labelStyle, fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: color || C.text }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ── Growth Chart Tooltip ── */
function GrowthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 11, color: C.green, fontFamily: MONO }}>
          ${p.value.toFixed(2)}
        </div>
      ))}
    </div>
  );
}


export default function DividendEventsTimeline({ accountFilter }) {
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [incomeSummary, setIncomeSummary] = useState(null);
  const [yearlyData, setYearlyData] = useState(null);
  const [yearlyLoading, setYearlyLoading] = useState(true);
  const [expandedTicker, setExpandedTicker] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const months = [];
      // 3 past + 3 future months
      for (let i = -3; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      const [calResults, intelligence] = await Promise.all([
        Promise.all(months.map(m => api.getDividendCalendar(m, accountFilter).catch(() => null))),
        api.getPortfolioIntelligence(accountFilter).catch(() => null),
      ]);

      const allEvents = [];
      calResults.forEach(r => {
        if (r?.events) r.events.forEach(ev => allEvents.push(ev));
      });

      // Deduplicate by ticker+date+type
      const seen = new Set();
      const unique = allEvents.filter(ev => {
        const key = `${ev.ticker}:${ev.date}:${ev.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      unique.sort((a, b) => b.date.localeCompare(a.date));
      setData(unique);

      // Extract income summary from intelligence data
      if (intelligence?.dividends) {
        const div = intelligence.dividends;
        setIncomeSummary({
          annualIncome: div.summary?.annual_income || 0,
          monthlyIncome: (div.summary?.annual_income || 0) / 12,
          dailyIncome: (div.summary?.annual_income || 0) / 365,
          weightedYield: div.summary?.weighted_yield || 0,
          weightedYoc: div.summary?.weighted_yield_on_cost || 0,
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountFilter]);

  const fetchYearly = useCallback(async () => {
    setYearlyLoading(true);
    try {
      const result = await api.getDividendYearlyComparison(accountFilter);
      setYearlyData(result);
    } catch {
      // Non-critical
    } finally {
      setYearlyLoading(false);
    }
  }, [accountFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchYearly(); }, [fetchYearly]);

  const today = new Date().toISOString().split('T')[0];

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data;
    if (filter === 'ex-dividend') return data;
    if (filter === 'est-payment') {
      // Sort/group by estimated payment date instead
      return [...data]
        .filter(ev => ev.estimated_payment_date)
        .sort((a, b) => b.estimated_payment_date.localeCompare(a.estimated_payment_date));
    }
    return data;
  }, [data, filter]);

  const groupedByMonth = useMemo(() => {
    const groups = {};
    filteredEvents.forEach(ev => {
      const dateKey = filter === 'est-payment' && ev.estimated_payment_date
        ? ev.estimated_payment_date
        : ev.date;
      const mk = dateKey.substring(0, 7);
      if (!groups[mk]) groups[mk] = [];
      groups[mk].push(ev);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, events]) => ({
        month,
        label: new Date(month + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        events,
        total: events.reduce((s, e) => s + (e.estimated_income || 0), 0),
      }));
  }, [filteredEvents, filter]);

  // Future projections chart data
  const projectionData = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    const futureMonths = {};
    data.forEach(ev => {
      if (ev.date >= today) {
        const mk = ev.date.substring(0, 7);
        futureMonths[mk] = (futureMonths[mk] || 0) + (ev.estimated_income || 0);
      }
    });
    return Object.entries(futureMonths)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 6)
      .map(([month, total]) => ({
        month: new Date(month + '-01').toLocaleString('en-US', { month: 'short' }),
        total: Math.round(total * 100) / 100,
      }));
  }, [data, today]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map(i => <SkeletonCard key={i} height={80} />)}
      </div>
    );
  }

  if (error) {
    return <InlineError message="Failed to load events" onRetry={fetchData} />;
  }

  if (!data || data.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={{ color: C.textDim, fontSize: 12 }}>No dividend events found.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Income Summary Strip */}
      {incomeSummary && (
        <div style={{
          display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8,
          marginBottom: 16,
        }}>
          <StatCell label="Annual Income" value={`$${incomeSummary.annualIncome.toFixed(2)}`} color={C.green} />
          <StatCell label="Monthly Income" value={`$${incomeSummary.monthlyIncome.toFixed(2)}`} color={C.green} />
          <StatCell label="Daily Income" value={`$${incomeSummary.dailyIncome.toFixed(2)}`} color={C.green} />
          <StatCell label="Dividend Yield" value={`${incomeSummary.weightedYield.toFixed(2)}%`} color={C.amber} sub={`YoC: ${incomeSummary.weightedYoc.toFixed(2)}%`} />
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 12px', borderRadius: 6,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: filter === f.id ? C.accent + '22' : C.card,
              color: filter === f.id ? C.accent : C.textMuted,
              border: `1px solid ${filter === f.id ? C.accent : C.border}`,
              minHeight: 44, transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {groupedByMonth.map(group => (
        <div key={group.month} style={{ marginBottom: 20 }}>
          {/* Month Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', marginBottom: 8,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{group.label}</span>
            {group.total > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: C.green }}>
                ${group.total.toFixed(2)}
              </span>
            )}
          </div>

          {/* Events */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {group.events.map((ev, i) => {
              const isPast = ev.date < today;
              const evColor = C.amber;
              const displayDate = filter === 'est-payment' && ev.estimated_payment_date
                ? ev.estimated_payment_date
                : ev.date;
              const dateLabel = formatShortDate(displayDate);

              return (
                <div key={`${ev.ticker}-${ev.date}-${i}`} style={{
                  padding: '10px 12px', background: C.card, borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  opacity: isPast ? 0.55 : 1,
                  borderLeft: `3px solid ${ev.estimated ? C.textDim : evColor}`,
                  fontStyle: ev.estimated ? 'italic' : 'normal',
                  animation: 'fadeSlideUp 0.3s ease-out both',
                  animationDelay: `${i * 0.03}s`,
                }}>
                  {/* Main row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: C.textMuted, fontFamily: MONO, minWidth: 48, fontWeight: 600 }}>
                      {dateLabel}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: C.text, minWidth: 50 }}>
                      {ev.ticker}
                    </span>
                    <span style={badge(evColor)}>Ex-Div</span>
                    {ev.estimated && <span style={badge(C.textDim)}>Est.</span>}
                    <span style={{ marginLeft: 'auto', fontFamily: MONO, fontWeight: 700, fontSize: 13, color: C.green }}>
                      +${(ev.estimated_income || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Payment date annotation */}
                  {ev.estimated_payment_date && filter !== 'est-payment' && (
                    <div style={{
                      marginTop: 6, display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth={2} strokeLinecap="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span style={{ fontSize: 10, color: C.cyan, fontWeight: 600 }}>
                        Est. payment: {formatShortDate(ev.estimated_payment_date)}
                      </span>
                      {!isMobile && (
                        <span style={{ fontSize: 10, color: C.textDim, marginLeft: 4 }}>
                          (${(ev.amount_per_share || 0).toFixed(4)}/sh &times; {(ev.shares_held || 0).toFixed(1)})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Future Projections */}
      {projectionData.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 20 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>
            Upcoming Projected Income
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={projectionData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="month" tick={{ fill: C.textDim, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={50} tickFormatter={v => `$${v}`} />
              <Tooltip content={<GrowthTooltip />} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {projectionData.map((_, i) => (
                  <Cell key={i} fill={C.green} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Year-over-Year Comparison */}
      {!yearlyLoading && yearlyData && yearlyData.years?.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>
            Dividend Growth
          </h3>

          {/* Yearly totals bar chart */}
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={yearlyData.years.map(y => ({ year: String(y.year), total: y.total_income }))}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <XAxis dataKey="year" tick={{ fill: C.textDim, fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} width={55} tickFormatter={v => `$${v}`} />
              <Tooltip content={<GrowthTooltip />} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {yearlyData.years.map((y, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Growth rates */}
          {yearlyData.growth_rates && Object.keys(yearlyData.growth_rates).length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {Object.entries(yearlyData.growth_rates).map(([key, rate]) => {
                if (rate === null) return null;
                const [fromY, , toY] = key.split('_');
                const isPositive = rate >= 0;
                return (
                  <div key={key} style={{
                    background: C.bg, borderRadius: 8, padding: '8px 12px',
                    border: `1px solid ${C.border}`, flex: 1, minWidth: 100,
                  }}>
                    <div style={{ ...labelStyle, fontSize: 9, marginBottom: 2 }}>{fromY} → {toY}</div>
                    <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: isPositive ? C.green : C.red }}>
                      {isPositive ? '+' : ''}{rate.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Per-ticker growth table */}
          {yearlyData.per_ticker_growth?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...labelStyle, fontSize: 10, marginBottom: 8 }}>Per-Ticker Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {yearlyData.per_ticker_growth.slice(0, 15).map((ptg) => {
                  const years = Object.keys(ptg.years).sort();
                  const isExpanded = expandedTicker === ptg.ticker;
                  return (
                    <div key={ptg.ticker}>
                      <div
                        onClick={() => setExpandedTicker(isExpanded ? null : ptg.ticker)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10,
                          padding: isMobile ? '8px 8px' : '10px 14px', background: C.bg, borderRadius: 8,
                          border: `1px solid ${isExpanded ? C.accent + '44' : C.border}`,
                          cursor: 'pointer', transition: 'border-color 0.15s',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                      >
                        <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, fontFamily: MONO, color: C.text, minWidth: isMobile ? 40 : 55 }}>
                          {ptg.ticker}
                        </span>
                        <div style={{ display: 'flex', gap: isMobile ? 6 : 12, flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                          {years.map(y => (
                            <div key={y} style={{ textAlign: 'right', minWidth: isMobile ? 36 : 50 }}>
                              <div style={{ fontSize: 8, color: C.textDim }}>{y}</div>
                              <div style={{ fontSize: 11, fontFamily: MONO, fontWeight: 600, color: ptg.years[y] > 0 ? C.text : C.textDim }}>
                                ${ptg.years[y].toFixed(0)}
                              </div>
                            </div>
                          ))}
                          {ptg.growth_pct !== null && (
                            <span style={{
                              fontFamily: MONO, fontSize: 11, fontWeight: 700, minWidth: 48, textAlign: 'right',
                              color: ptg.growth_pct >= 0 ? C.green : C.red,
                            }}>
                              {ptg.growth_pct >= 0 ? '+' : ''}{ptg.growth_pct.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Expanded detail */}
                      {isExpanded && (
                        <div style={{
                          padding: '8px 10px 8px 20px', background: C.card, borderRadius: '0 0 8px 8px',
                          borderLeft: `2px solid ${C.accent}`, marginTop: -1,
                        }}>
                          <div style={{ ...labelStyle, fontSize: 9, marginBottom: 6 }}>Per Share by Year</div>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {years.map(y => (
                              <div key={y}>
                                <div style={{ fontSize: 9, color: C.textDim }}>{y}</div>
                                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.text }}>
                                  ${(ptg.per_share_by_year?.[y] || 0).toFixed(4)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {yearlyLoading && <SkeletonCard height={200} style={{ marginTop: 16 }} />}
    </div>
  );
}
