import { useMemo, useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { C, MONO } from '../styles/theme';
import { cardStyle, tableHeader } from '../styles/shared';
import { api } from '../hooks/useApi';
import { SkeletonCard } from './SkeletonLoader';
import { InlineError } from './ErrorBoundary';

export default function PerformanceReturnsSection({ holdings, accountFilter }) {
  const [showCagr, setShowCagr] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const data = await api.getPortfolioAnalytics(accountFilter);
      setAnalytics(data);
    } catch (err) {
      setAnalyticsError(err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [accountFilter]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  const computeCagr = (gainLossPct, purchaseDate) => {
    if (!purchaseDate) return null;
    const start = new Date(purchaseDate);
    const now = new Date();
    const years = (now - start) / (365.25 * 24 * 60 * 60 * 1000);
    if (years < 0.05) return null;
    const totalReturn = gainLossPct / 100;
    const cagr = (Math.pow(1 + totalReturn, 1 / years) - 1) * 100;
    return cagr;
  };

  const gainLossData = useMemo(() =>
    holdings.map(h => {
      const cagr = computeCagr(h.gain_loss_pct, h.purchase_date);
      return {
        ticker: h.ticker,
        gain: Math.round(h.gain_loss),
        pct: h.gain_loss_pct.toFixed(1),
        gain_loss_pct: h.gain_loss_pct,
        purchase_date: h.purchase_date,
        cagr,
        color: h.gain_loss >= 0 ? C.green : C.red,
        cagrColor: cagr !== null ? (cagr >= 0 ? C.green : C.red) : C.textDim,
      };
    }).sort((a, b) => showCagr
      ? (Math.abs(b.cagr ?? 0) - Math.abs(a.cagr ?? 0))
      : (b.gain - a.gain)
    ), [holdings, showCagr]);

  const winners = gainLossData.filter(d => d.gain > 0);
  const losers = gainLossData.filter(d => d.gain < 0);
  const totalWins = winners.reduce((s, d) => s + d.gain, 0);
  const totalLosses = Math.abs(losers.reduce((s, d) => s + d.gain, 0));

  const attributionData = useMemo(() => {
    if (!analytics?.holdings_detail) return [];
    return [...analytics.holdings_detail]
      .sort((a, b) => Math.abs(b.return_contribution) - Math.abs(a.return_contribution));
  }, [analytics]);

  return (
    <div>
      {/* Bar Chart */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>
            {showCagr ? 'Annualized Return (CAGR)' : 'Unrealized Gain/Loss'} - All Positions
          </h3>
          <button
            onClick={() => setShowCagr(v => !v)}
            style={{
              background: showCagr ? C.cyan + '22' : 'transparent',
              border: `1px solid ${showCagr ? C.cyan : C.border}`,
              color: showCagr ? C.cyan : C.textMuted,
              borderRadius: 6, padding: '5px 10px', fontSize: 11,
              fontWeight: 600, cursor: 'pointer', minHeight: 44,
              transition: 'all 0.2s',
            }}
          >
            {showCagr ? 'Show G/L' : 'Show CAGR'}
          </button>
        </div>
        <ResponsiveContainer width="100%" height={Math.max(300, gainLossData.length * 28)}>
          <BarChart data={gainLossData} layout="vertical" margin={{ left: 50, right: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: C.textDim, fontSize: 10 }}
              tickFormatter={v => showCagr
                ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`
                : `$${v >= 0 ? '' : '-'}${Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'k' : Math.abs(v)}`
              }
            />
            <YAxis type="category" dataKey="ticker" tick={{ fill: C.text, fontSize: 11, fontWeight: 600, fontFamily: MONO }} width={50} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              const cagr = d.cagr;
              return (
                <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: C.text }}>{d.ticker}</div>
                  <div style={{ color: d.gain >= 0 ? C.green : C.red }}>${d.gain.toLocaleString()} ({d.pct}%)</div>
                  {cagr !== null && (
                    <div style={{ color: C.cyan, fontSize: 11, marginTop: 2 }}>
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
            <Bar dataKey={showCagr ? 'cagr' : 'gain'} radius={[0, 6, 6, 0]} barSize={18}>
              {gainLossData.map((e, i) => (
                <Cell key={i} fill={showCagr ? e.cagrColor : e.color} fillOpacity={0.75} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
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

      {/* Return Attribution Table */}
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>
          Return Attribution
        </h3>
        {analyticsLoading ? (
          <SkeletonCard height={120} />
        ) : analyticsError ? (
          <InlineError message="Failed to load attribution data" onRetry={fetchAnalytics} />
        ) : attributionData.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textDim }}>No attribution data available.</div>
        ) : (
          <div data-no-swipe style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Ticker', 'Weight', 'Return', 'Contribution'].map(h => (
                    <th key={h} style={tableHeader}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attributionData.map((h, i) => {
                  const isPositive = h.return_contribution >= 0;
                  return (
                    <tr key={`${h.ticker}-${i}`} style={{ borderBottom: `1px solid ${C.border}22` }}>
                      <td style={{ padding: '6px 10px', fontWeight: 700, fontFamily: MONO, color: C.text }}>{h.ticker}</td>
                      <td style={{ padding: '6px 10px', fontFamily: MONO, color: C.textMuted }}>{h.weight.toFixed(1)}%</td>
                      <td style={{ padding: '6px 10px', fontFamily: MONO, color: h.gain_loss_pct >= 0 ? C.green : C.red }}>
                        {h.gain_loss_pct >= 0 ? '+' : ''}{h.gain_loss_pct.toFixed(1)}%
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: MONO, fontWeight: 700, color: isPositive ? C.green : C.red }}>
                        {isPositive ? '+' : ''}{h.return_contribution.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
