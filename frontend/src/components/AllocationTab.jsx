import { useMemo, useState } from 'react';
import { C, TYPE_COLORS, MONO, ASSET_CLASS_LABELS } from '../styles/theme';
import { cardStyle, sectionTitle, tableHeader, badge, srOnly } from '../styles/shared';
import PositionConcentration from './PositionConcentration';
import DriftAnalysis from './DriftAnalysis';
import RebalancePlanner from './RebalancePlanner';
import AssetClassBreakdown from './AssetClassBreakdown';
import FundComparison from './FundComparison';
import HoldingCard from './HoldingCard';
import SearchInput from './SearchInput';
import useMediaQuery from '../hooks/useMediaQuery';

const SORT_OPTIONS = [
  { key: 'drift', label: 'Drift' },
  { key: 'value', label: 'Value' },
  { key: 'gl', label: 'G/L %' },
  { key: 'ticker', label: 'Ticker' },
];

/**
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings - Filtered holdings
 * @param {number} props.totalValue - Total portfolio value
 * @param {import('../types').Settings} props.settings - User settings
 * @param {string} props.accountFilter - Current account filter
 */
export default function AllocationTab({ holdings, totalValue, settings, accountFilter }) {
  const showTargetDrift = !accountFilter || accountFilter === 'all' || accountFilter === 'brokerage';
  const isAllAccounts = !accountFilter || accountFilter === 'all';
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [expandedId, setExpandedId] = useState(null);
  const [sortKey, setSortKey] = useState('drift');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredHoldings = useMemo(() => {
    if (!searchQuery.trim()) return holdings;
    const q = searchQuery.trim().toUpperCase();
    return holdings.filter(h => h.ticker.toUpperCase().includes(q) || (h.manual_name || '').toUpperCase().includes(q));
  }, [holdings, searchQuery]);

  const sortedHoldings = useMemo(() => {
    const arr = [...filteredHoldings];
    switch (sortKey) {
      case 'drift':  return arr.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
      case 'value':  return arr.sort((a, b) => (b.market_value || 0) - (a.market_value || 0));
      case 'gl':     return arr.sort((a, b) => (b.gain_loss_pct || 0) - (a.gain_loss_pct || 0));
      case 'ticker': return arr.sort((a, b) => a.ticker.localeCompare(b.ticker));
      default:       return arr;
    }
  }, [filteredHoldings, sortKey]);

  const baseHeaders = ['Ticker', 'Type', 'Class', 'Account', 'Shares', 'Avg Cost', 'Current', 'Value', 'G/L $', 'G/L %', 'Actual %'];
  const headers = showTargetDrift ? [...baseHeaders, 'Target %', 'Drift'] : baseHeaders;

  return (
    <div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* Position Concentration */}
        <PositionConcentration holdings={holdings} totalValue={totalValue} />

        {/* Asset Class Breakdown + Suggestions */}
        <AssetClassBreakdown holdings={holdings} totalValue={totalValue} accountFilter={accountFilter} />

        {/* Drift Analysis — only for brokerage */}
        {showTargetDrift && <DriftAnalysis holdings={holdings} totalValue={totalValue} settings={settings} />}
      </div>

      {/* Fund Comparison — when 2+ funds share an asset class */}
      <div style={{ marginBottom: 16 }}>
        <FundComparison holdings={holdings} />
      </div>

      {/* Rebalance Planner — only for brokerage */}
      {showTargetDrift && <RebalancePlanner holdings={holdings} totalValue={totalValue} />}

      {isMobile ? (
        /* ── Mobile: Card List ── */
        <div>
          <h3 style={{ ...sectionTitle, margin: '0 0 10px' }}>
            All Holdings
          </h3>

          <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.bg, paddingBottom: 8 }}>
            <SearchInput value={searchQuery} onChange={setSearchQuery} />
          </div>

          {/* Sort pill bar */}
          <div role="toolbar" aria-label="Sort holdings" data-no-swipe style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto' }}>
            {SORT_OPTIONS.map(opt => {
              const active = sortKey === opt.key;
              return (
                <button
                  key={opt.key}
                  aria-pressed={active}
                  onClick={() => setSortKey(opt.key)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    minHeight: 32,
                    border: `1px solid ${active ? C.accent : C.border}`,
                    background: active ? C.accent + '22' : 'transparent',
                    color: active ? C.accent : C.textMuted,
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Card list */}
          {searchQuery.trim() && sortedHoldings.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 13 }}>
              No holdings match '{searchQuery.trim()}'
            </div>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedHoldings.map(h => (
              <HoldingCard
                key={h.id}
                holding={h}
                isExpanded={expandedId === h.id}
                onToggle={() => setExpandedId(prev => prev === h.id ? null : h.id)}
                showTargetDrift={showTargetDrift}
                isAllAccounts={isAllAccounts}
              />
            ))}
          </div>
          )}
        </div>
      ) : (
        /* ── Desktop: Table with sticky headers ── */
        <div style={cardStyle}>
          <h3 style={{ ...sectionTitle, margin: '0 0 12px' }}>
            {showTargetDrift ? 'All Holdings - Sorted by Drift' : 'All Holdings'}
          </h3>
          <div style={{ marginBottom: 8 }}>
            <SearchInput value={searchQuery} onChange={setSearchQuery} />
          </div>
          {searchQuery.trim() && sortedHoldings.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 13 }}>
              No holdings match '{searchQuery.trim()}'
            </div>
          ) : (
          <div data-no-swipe style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {headers.map(h => (
                    <th key={h} style={{ ...tableHeader, position: 'sticky', top: 0, background: C.card, zIndex: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map(h => {
                  const hIsBrokerage = (h.account_type || 'brokerage') === 'brokerage';
                  return (
                    <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: MONO }}>{h.is_manual && h.manual_name ? h.manual_name : h.ticker}</td>
                      <td style={{ padding: '8px 10px' }}><span style={{ color: TYPE_COLORS[h.type], fontSize: 10, fontWeight: 600 }}>{h.type}</span></td>
                      <td style={{ padding: '8px 10px', fontSize: 10, color: C.textMuted }}>{ASSET_CLASS_LABELS[h.asset_class] || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={badge(h.account_type === '401k' ? C.purple : h.account_type === 'crypto' ? '#F7931A' : C.blue)}>
                          {h.account_type || 'brokerage'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>{h.shares}</td>
                      <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>${(h.avg_cost || 0).toFixed(0)}</td>
                      <td style={{ padding: '8px 10px', fontFamily: MONO }}>${(h.current_price || h.avg_cost || 0).toFixed(0)}</td>
                      <td style={{ padding: '8px 10px', fontFamily: MONO }}>${(h.market_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td style={{ padding: '8px 10px', fontFamily: MONO, color: (h.gain_loss || 0) >= 0 ? C.green : C.red }}><span style={srOnly}>{(h.gain_loss || 0) >= 0 ? 'gain ' : 'loss '}</span>{(h.gain_loss || 0) >= 0 ? '+' : ''}${(h.gain_loss || 0).toFixed(0)}</td>
                      <td style={{ padding: '8px 10px', fontFamily: MONO, color: (h.gain_loss_pct || 0) >= 0 ? C.green : C.red }}><span style={srOnly}>{(h.gain_loss_pct || 0) >= 0 ? 'gain ' : 'loss '}</span>{(h.gain_loss_pct || 0) >= 0 ? '+' : ''}{(h.gain_loss_pct || 0).toFixed(1)}%</td>
                      <td style={{ padding: '8px 10px', fontFamily: MONO }}>{(h.actual_allocation || 0).toFixed(1)}%</td>
                      {showTargetDrift && (
                        <>
                          <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>
                            {isAllAccounts && !hIsBrokerage ? '-' : `${(h.target_allocation || 0).toFixed(1)}%`}
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: MONO, fontWeight: 700, color: isAllAccounts && !hIsBrokerage ? C.textDim : Math.abs(h.drift || 0) < 0.5 ? C.textDim : (h.drift || 0) > 0 ? C.red : C.green }}>
                            {isAllAccounts && !hIsBrokerage ? '-' : <><span style={srOnly}>{(h.drift || 0) > 0 ? 'overweight ' : 'underweight '}</span>{`${(h.drift || 0) > 0 ? '+' : ''}${(h.drift || 0).toFixed(1)}%`}</>}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
