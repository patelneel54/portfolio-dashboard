import { useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import PortfolioPerformanceChart from './PortfolioPerformanceChart';
import PortfolioAnalytics from './PortfolioAnalytics';

/**
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings - Filtered holdings
 * @param {number} props.totalValue - Total portfolio value
 * @param {string} props.accountFilter - Current account filter
 */
export default function OverviewTab({ holdings, totalValue, accountFilter }) {
  const driftData = useMemo(() =>
    holdings.filter(h => (h.account_type || 'brokerage') === 'brokerage')
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 8), [holdings]);

  return (
    <div>
      {/* Portfolio Performance Chart */}
      <div style={{ marginBottom: 16 }}>
        <PortfolioPerformanceChart accountFilter={accountFilter} />
      </div>

      {/* Portfolio Analytics (3-level drillable) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 16 }}>
        <PortfolioAnalytics accountFilter={accountFilter} />
      </div>

      {/* Drift Table — brokerage only */}
      {driftData.length > 0 && <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: C.textMuted }}>Portfolio Drift - Biggest Misallocations</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {driftData.map((h, i) => {
            const isOver = h.drift > 0;
            return (
              <div key={h.id} style={{ padding: '10px 14px', background: C.elevated, borderRadius: 8, border: `1px solid ${isOver ? C.red + '33' : C.green + '33'}`, animation: 'fadeSlideUp 0.35s ease-out both', animationDelay: `${i * 0.07}s` }}>
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
