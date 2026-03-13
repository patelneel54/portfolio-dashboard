import { useState, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { cardStyle, inputStyle, sectionTitle, tableHeader, labelStyle } from '../styles/shared';
import useMediaQuery from '../hooks/useMediaQuery';

export default function RebalancePlanner({ holdings = [], totalValue = 0 }) {
  const [isOpen, setIsOpen] = useState(false);
  const [budget, setBudget] = useState('');
  const [mode, setMode] = useState('buyOnly');
  const [copied, setCopied] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');

  const parsedBudget = parseFloat(budget.replace(/[^0-9.]/g, '')) || 0;

  // Only brokerage holdings with a target allocation participate
  const eligible = useMemo(() =>
    holdings.filter(h =>
      (h.account_type || 'brokerage') === 'brokerage' &&
      h.target_allocation > 0 &&
      h.current_price > 0
    ), [holdings]);

  const plan = useMemo(() => {
    if (!eligible.length || !totalValue) return [];

    if (mode === 'buyOnly') {
      if (parsedBudget <= 0) return [];
      const underweight = eligible.filter(h => (h.drift || 0) < 0);
      if (!underweight.length) return [];
      const totalDrift = underweight.reduce((s, h) => s + Math.abs(h.drift), 0);
      if (totalDrift === 0) return [];

      return underweight
        .map(h => {
          const amount = parsedBudget * (Math.abs(h.drift) / totalDrift);
          const shares = Math.floor(amount / h.current_price);
          return {
            ticker: h.ticker,
            currentPct: h.actual_allocation || 0,
            targetPct: h.target_allocation,
            drift: h.drift,
            action: 'BUY',
            amount: shares * h.current_price,
            shares,
            price: h.current_price,
          };
        })
        .filter(r => r.shares > 0)
        .sort((a, b) => b.amount - a.amount);
    }

    // Full rebalance
    const newTotal = totalValue + parsedBudget;
    return eligible
      .map(h => {
        const targetValue = (h.target_allocation / 100) * newTotal;
        const diff = targetValue - (h.market_value || 0);
        const absDiff = Math.abs(diff);
        if (absDiff < h.current_price) return null; // less than 1 share
        const shares = Math.floor(absDiff / h.current_price);
        return {
          ticker: h.ticker,
          currentPct: h.actual_allocation || 0,
          targetPct: h.target_allocation,
          drift: h.drift || 0,
          action: diff > 0 ? 'BUY' : 'SELL',
          amount: shares * h.current_price,
          shares,
          price: h.current_price,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.amount - a.amount);
  }, [eligible, totalValue, parsedBudget, mode]);

  const totalBuy = plan.filter(r => r.action === 'BUY').reduce((s, r) => s + r.amount, 0);
  const totalSell = plan.filter(r => r.action === 'SELL').reduce((s, r) => s + r.amount, 0);
  const remaining = mode === 'buyOnly' ? parsedBudget - totalBuy : parsedBudget - totalBuy + totalSell;

  const copyPlan = () => {
    const modeLabel = mode === 'buyOnly' ? 'buy-only' : 'full rebalance';
    const lines = [`Rebalance Plan ($${parsedBudget.toFixed(0)} budget, ${modeLabel}):`];
    plan.forEach(r => {
      const shareWord = r.shares === 1 ? 'share' : 'shares';
      lines.push(`${r.action} ${r.shares} ${shareWord} ${r.ticker} @ $${r.price.toFixed(2)} = $${r.amount.toFixed(2)}`);
    });
    lines.push('---');
    const parts = [`Total buys: $${totalBuy.toFixed(2)}`];
    if (totalSell > 0) parts.push(`Total sells: $${totalSell.toFixed(2)}`);
    if (remaining > 0.01) parts.push(`Remaining cash: $${remaining.toFixed(2)}`);
    lines.push(parts.join(' | '));

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const chevron = isOpen ? '\u25B2' : '\u25BC';

  return (
    <div style={{ ...cardStyle, padding: 0, marginBottom: 16, overflow: 'hidden' }}>
      {/* Header — always visible */}
      <button
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'transparent', border: 'none',
          cursor: 'pointer', minHeight: 44, gap: 8,
        }}
      >
        <span style={{ ...sectionTitle, margin: 0 }}>Rebalance Planner</span>
        <span aria-hidden="true" style={{ fontSize: 10, color: C.textDim }}>{chevron}</span>
      </button>

      {/* Collapsible body */}
      <div style={{
        maxHeight: isOpen ? 2000 : 0,
        overflow: 'hidden',
        transition: 'max-height 250ms ease',
      }}>
        <div style={{ padding: '0 20px 20px' }}>
          {/* Controls */}
          <div style={{
            display: 'flex', gap: 12, marginBottom: 16,
            flexWrap: 'wrap', alignItems: 'center',
          }}>
            {/* Budget input */}
            <input
              type="text"
              inputMode="decimal"
              value={budget}
              onChange={e => setBudget(e.target.value)}
              placeholder="$0"
              aria-label="Budget amount in dollars"
              style={{
                ...inputStyle, padding: '10px 14px', fontSize: 14,
                width: 120, minHeight: 44, background: C.bg,
              }}
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.border}
            />

            {/* Mode toggle */}
            <div role="radiogroup" aria-label="Rebalance mode" style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {[
                { key: 'buyOnly', label: 'Buy Only' },
                { key: 'full', label: 'Full Rebalance' },
              ].map(opt => {
                const active = mode === opt.key;
                return (
                  <button
                    key={opt.key}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(opt.key)}
                    style={{
                      padding: '8px 16px', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', minHeight: 44, border: 'none',
                      background: active ? C.accent + '22' : 'transparent',
                      color: active ? C.accent : C.textMuted,
                      transition: 'all 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Empty state */}
          {plan.length === 0 && (
            <div style={{ fontSize: 12, color: C.textDim, padding: '12px 0' }}>
              {mode === 'buyOnly' && parsedBudget <= 0
                ? 'Enter a budget to see your rebalance plan.'
                : 'No rebalance actions needed — positions are on target.'}
            </div>
          )}

          {/* Results */}
          {plan.length > 0 && (
            <>
              {isMobile ? (
                /* ── Mobile: Cards ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {plan.map(r => (
                    <div key={r.ticker} style={{
                      background: C.bg, borderRadius: 8, padding: 14,
                      border: `1px solid ${C.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14, color: C.text }}>{r.ticker}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                          background: (r.action === 'BUY' ? C.green : C.red) + '22',
                          color: r.action === 'BUY' ? C.green : C.red,
                        }}>
                          {r.action}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                        <MiniDetail label="Current %" value={`${r.currentPct.toFixed(1)}%`} />
                        <MiniDetail label="Target %" value={`${r.targetPct.toFixed(1)}%`} />
                        <MiniDetail label="Drift" value={`${r.drift > 0 ? '+' : ''}${r.drift.toFixed(1)}%`}
                          color={Math.abs(r.drift) < 0.5 ? C.textDim : r.drift > 0 ? C.red : C.green} />
                        <MiniDetail label="Shares" value={r.shares} />
                        <MiniDetail label="Price" value={`$${r.price.toFixed(2)}`} />
                        <MiniDetail label="Amount" value={`$${r.amount.toFixed(2)}`}
                          color={r.action === 'BUY' ? C.green : C.red} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* ── Desktop: Table ── */
                <div data-no-swipe style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {['Ticker', 'Current %', 'Target %', 'Drift', 'Action', 'Shares', 'Price', 'Amount'].map(h => (
                          <th key={h} style={tableHeader}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.map(r => (
                        <tr key={r.ticker} style={{ borderBottom: `1px solid ${C.border}22` }}>
                          <td style={{ padding: '8px 10px', fontFamily: MONO, fontWeight: 700 }}>{r.ticker}</td>
                          <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>{r.currentPct.toFixed(1)}%</td>
                          <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>{r.targetPct.toFixed(1)}%</td>
                          <td style={{
                            padding: '8px 10px', fontFamily: MONO, fontWeight: 700,
                            color: Math.abs(r.drift) < 0.5 ? C.textDim : r.drift > 0 ? C.red : C.green,
                          }}>
                            {r.drift > 0 ? '+' : ''}{r.drift.toFixed(1)}%
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                              background: (r.action === 'BUY' ? C.green : C.red) + '22',
                              color: r.action === 'BUY' ? C.green : C.red,
                            }}>
                              {r.action}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: MONO }}>{r.shares}</td>
                          <td style={{ padding: '8px 10px', fontFamily: MONO, color: C.textMuted }}>${r.price.toFixed(2)}</td>
                          <td style={{
                            padding: '8px 10px', fontFamily: MONO, fontWeight: 700,
                            color: r.action === 'BUY' ? C.green : C.red,
                          }}>
                            ${r.amount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary footer */}
              <div style={{
                marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`,
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: C.green, fontFamily: MONO, fontWeight: 600 }}>
                    Buy: ${totalBuy.toFixed(2)}
                  </span>
                  {totalSell > 0 && (
                    <span style={{ fontSize: 12, color: C.red, fontFamily: MONO, fontWeight: 600 }}>
                      Sell: ${totalSell.toFixed(2)}
                    </span>
                  )}
                  {remaining > 0.01 && (
                    <span style={{ fontSize: 12, color: C.textDim, fontFamily: MONO }}>
                      Remaining: ${remaining.toFixed(2)}
                    </span>
                  )}
                </div>

                <button
                  onClick={copyPlan}
                  style={{
                    padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', minHeight: 36, transition: 'all 0.15s',
                    background: copied ? C.green + '22' : 'transparent',
                    border: `1px solid ${copied ? C.green : C.accent}`,
                    color: copied ? C.green : C.accent,
                  }}
                >
                  {copied ? 'Copied!' : 'Copy Plan'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniDetail({ label, value, color }) {
  return (
    <div>
      <div style={{ ...labelStyle, color: C.textDim, letterSpacing: 0.5, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: color || C.text }}>
        {value}
      </div>
    </div>
  );
}
