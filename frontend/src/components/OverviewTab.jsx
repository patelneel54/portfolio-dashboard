import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { api } from '../hooks/useApi';
import PortfolioPerformanceChart from './PortfolioPerformanceChart';
import PortfolioAnalytics from './PortfolioAnalytics';
import DividendIntelligence from './DividendIntelligence';
import DividendCalendar from './DividendCalendar';
import { InlineError } from './ErrorBoundary';
import { SkeletonCard } from './SkeletonLoader';

/**
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings - Filtered holdings
 * @param {number} props.totalValue - Total portfolio value
 * @param {string} props.accountFilter - Current account filter
 */
export default function OverviewTab({ holdings, totalValue, accountFilter }) {
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);

  const fetchIntelligence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPortfolioIntelligence(accountFilter);
      setIntelligence(data);
    } catch (err) {
      console.error('Failed to fetch portfolio intelligence:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountFilter]);

  useEffect(() => {
    fetchIntelligence();
  }, [fetchIntelligence]);

  const driftData = useMemo(() =>
    holdings.filter(h => (h.account_type || 'brokerage') === 'brokerage')
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 8), [holdings]);

  return (
    <div>
      {/* Portfolio Performance Chart */}
      <div style={{ marginBottom: 16 }}>
        <PortfolioPerformanceChart accountFilter={accountFilter} />
      </div>

      {/* Portfolio Analytics (3-level drillable) + Dividend Intelligence */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 16 }}>
        <PortfolioAnalytics accountFilter={accountFilter} />
        {loading ? (
          <SkeletonCard height={140} />
        ) : error ? (
          <InlineError message="Failed to load portfolio intelligence" onRetry={fetchIntelligence} />
        ) : (
          <DividendIntelligence dividends={intelligence?.dividends} />
        )}
        {!loading && !error && intelligence?.dividends?.summary?.total_annual_income > 0 && (
          <>
            <button
              onClick={() => setShowCalendar(v => !v)}
              aria-expanded={showCalendar}
              style={{
                background: showCalendar ? C.green + '11' : 'transparent',
                border: `1px solid ${showCalendar ? C.green + '44' : C.border}`,
                color: showCalendar ? C.green : C.textMuted,
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                transition: 'all 0.2s',
              }}
            >
              {showCalendar ? 'Hide Calendar' : 'View Dividend Calendar'}
              <span style={{ fontSize: 10 }}>{showCalendar ? '\u25B2' : '\u25BC'}</span>
            </button>
            {showCalendar && <DividendCalendar accountFilter={accountFilter} />}
          </>
        )}
      </div>

      {/* Drift Table — brokerage only */}
      {driftData.length > 0 && <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Portfolio Drift - Biggest Misallocations</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {driftData.map(h => {
            const isOver = h.drift > 0;
            return (
              <div key={h.id} style={{ padding: '10px 14px', background: '#0d1424', borderRadius: 8, border: `1px solid ${isOver ? C.red + '33' : C.green + '33'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, fontFamily: MONO }}>{h.is_manual && h.manual_name ? h.manual_name : h.ticker}</span>
                    <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase', background: (h.account_type === '401k' ? C.purple : h.account_type === 'crypto' ? '#F7931A' : C.blue) + '22', color: h.account_type === '401k' ? C.purple : h.account_type === 'crypto' ? '#F7931A' : C.blue }}>
                      {h.account_type || 'brokerage'}
                    </span>
                  </div>
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
      </div>}
    </div>
  );
}
