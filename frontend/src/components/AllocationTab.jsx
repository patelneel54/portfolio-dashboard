import { useMemo } from 'react';
import { C, TYPE_COLORS, MONO } from '../styles/theme';
import PositionConcentration from './PositionConcentration';
import DriftAnalysis from './DriftAnalysis';

export default function AllocationTab({ holdings, totalValue, settings, accountFilter }) {
  const showTargetDrift = !accountFilter || accountFilter === 'all' || accountFilter === 'brokerage';
  const isAllAccounts = !accountFilter || accountFilter === 'all';

  const sortedByDrift = useMemo(() =>
    [...holdings].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)), [holdings]);

  const baseHeaders = ['Ticker', 'Type', 'Account', 'Shares', 'Avg Cost', 'Current', 'Value', 'G/L $', 'G/L %', 'Actual %'];
  const headers = showTargetDrift ? [...baseHeaders, 'Target %', 'Drift'] : baseHeaders;

  return (
    <div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* Position Concentration */}
        <PositionConcentration holdings={holdings} totalValue={totalValue} />

        {/* Drift Analysis — only for brokerage */}
        {showTargetDrift && <DriftAnalysis holdings={holdings} totalValue={totalValue} settings={settings} />}
      </div>

      {/* Full Holdings Table */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>
          {showTargetDrift ? 'All Holdings - Sorted by Drift' : 'All Holdings'}
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {headers.map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: C.textDim, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedByDrift.map(h => {
                const hIsBrokerage = (h.account_type || 'brokerage') === 'brokerage';
                return (
                  <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}22` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: MONO }}>{h.ticker}</td>
                    <td style={{ padding: '8px 10px' }}><span style={{ color: TYPE_COLORS[h.type], fontSize: 10, fontWeight: 600 }}>{h.type}</span></td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', background: (h.account_type === '401k' ? C.purple : h.account_type === 'crypto' ? '#F7931A' : C.blue) + '22', color: h.account_type === '401k' ? C.purple : h.account_type === 'crypto' ? '#F7931A' : C.blue }}>
                        {h.account_type || 'brokerage'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>{h.shares}</td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>${(h.avg_cost || 0).toFixed(0)}</td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO }}>${(h.current_price || h.avg_cost || 0).toFixed(0)}</td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO }}>${(h.market_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO, color: (h.gain_loss || 0) >= 0 ? C.green : C.red }}>{(h.gain_loss || 0) >= 0 ? '+' : ''}${(h.gain_loss || 0).toFixed(0)}</td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO, color: (h.gain_loss_pct || 0) >= 0 ? C.green : C.red }}>{(h.gain_loss_pct || 0) >= 0 ? '+' : ''}{(h.gain_loss_pct || 0).toFixed(1)}%</td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO }}>{(h.actual_allocation || 0).toFixed(1)}%</td>
                    {showTargetDrift && (
                      <>
                        <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>
                          {isAllAccounts && !hIsBrokerage ? '-' : `${(h.target_allocation || 0).toFixed(1)}%`}
                        </td>
                        <td style={{ padding: '8px 10px', fontFamily: MONO, fontWeight: 700, color: isAllAccounts && !hIsBrokerage ? C.textDim : Math.abs(h.drift || 0) < 0.5 ? C.textDim : (h.drift || 0) > 0 ? C.red : C.green }}>
                          {isAllAccounts && !hIsBrokerage ? '-' : `${(h.drift || 0) > 0 ? '+' : ''}${(h.drift || 0).toFixed(1)}%`}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
