import { useState, useEffect } from 'react';
import { C, MONO, ASSET_CLASS_COLORS, ASSET_CLASS_LABELS } from '../styles/theme';
import { cardStyle } from '../styles/shared';
import { api } from '../hooks/useApi';

const STOCK_CLASSES = new Set(['large_cap', 'mid_cap', 'small_cap', 'international', 'specialty', 'blended', 'unclassified']);
const BOND_CLASSES = new Set(['bond', 'stable_value', 'money_market']);

/**
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings
 * @param {number} props.totalValue
 * @param {string} [props.accountFilter]
 */
export default function AssetClassBreakdown({ holdings, totalValue, accountFilter }) {
  const [suggestions, setSuggestions] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [age, setAge] = useState(30);

  useEffect(() => {
    let cancelled = false;
    api.getRebalanceSuggestions(accountFilter !== 'all' ? accountFilter : undefined)
      .then(data => {
        if (!cancelled) {
          setSuggestions(data);
          if (data.model?.age) setAge(data.model.age);
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions({ suggestions: [], model: {} });
      });
    return () => { cancelled = true; };
  }, [accountFilter]);

  if (!holdings.length || totalValue <= 0) return null;

  // Group holdings by asset_class
  const classMap = {};
  for (const h of holdings) {
    const ac = h.asset_class || (h.type === 'Crypto' ? 'crypto' : 'unclassified');
    if (!classMap[ac]) classMap[ac] = { value: 0, count: 0 };
    classMap[ac].value += h.market_value || (h.shares * (h.current_price || h.avg_cost));
    classMap[ac].count += 1;
  }

  const sorted = Object.entries(classMap)
    .map(([key, data]) => ({ key, ...data, pct: (data.value / totalValue) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  // Stocks vs Bonds split
  let stocksValue = 0, bondsValue = 0;
  for (const { key, value } of sorted) {
    if (BOND_CLASSES.has(key)) bondsValue += value;
    else stocksValue += value;
  }
  const stocksPct = (stocksValue / totalValue) * 100;
  const bondsPct = (bondsValue / totalValue) * 100;
  const targetBonds = Math.min(age, 60);
  const targetStocks = 100 - targetBonds;

  const severityColors = { warning: C.amber, info: C.blue, action: C.red };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Asset Class Breakdown */}
      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>
          Asset Class Breakdown
        </div>

        {/* Stacked bar */}
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', height: 24, marginBottom: 14 }}>
          {sorted.map(({ key, pct }) => (
            <div
              key={key}
              title={`${ASSET_CLASS_LABELS[key] || key}: ${pct.toFixed(1)}%`}
              style={{
                width: `${pct}%`,
                background: ASSET_CLASS_COLORS[key] || '#475569',
                minWidth: pct > 0.5 ? 2 : 0,
                transition: 'width 0.3s',
              }}
            />
          ))}
        </div>

        {/* Legend + percentages */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {sorted.map(({ key, pct, value }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: ASSET_CLASS_COLORS[key] || '#475569', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.textMuted }}>{ASSET_CLASS_LABELS[key] || key}</span>
              <span style={{ fontSize: 11, fontFamily: MONO, color: C.text, marginLeft: 'auto' }}>{pct.toFixed(1)}%</span>
              <span style={{ fontSize: 10, fontFamily: MONO, color: C.textDim }}>${value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stocks vs Bonds Ratio */}
      <div style={{ ...cardStyle }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
          Stocks vs Bonds
        </div>

        {/* Dual bar */}
        <div style={{ display: 'flex', gap: 2, borderRadius: 6, overflow: 'hidden', height: 28, marginBottom: 10 }}>
          <div style={{ width: `${stocksPct}%`, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.3s' }}>
            {stocksPct > 10 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{stocksPct.toFixed(0)}%</span>}
          </div>
          <div style={{ width: `${bondsPct}%`, background: C.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width 0.3s' }}>
            {bondsPct > 10 && <span style={{ fontSize: 10, fontWeight: 700, color: '#000' }}>{bondsPct.toFixed(0)}%</span>}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 10 }}>
          <span style={{ color: C.blue }}>Stocks: {stocksPct.toFixed(1)}%</span>
          <span style={{ color: C.amber }}>Bonds: {bondsPct.toFixed(1)}%</span>
        </div>

        {/* Age-based recommendation */}
        <div style={{ padding: '10px 12px', background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>
            Age-based guideline (age {age})
          </div>
          <div style={{ display: 'flex', gap: 2, borderRadius: 4, overflow: 'hidden', height: 16, marginBottom: 6 }}>
            <div style={{ width: `${targetStocks}%`, background: `${C.blue}66` }} />
            <div style={{ width: `${targetBonds}%`, background: `${C.amber}66` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textDim }}>
            <span>Target: {targetStocks}% stocks</span>
            <span>Target: {targetBonds}% bonds</span>
          </div>
          {Math.abs(bondsPct - targetBonds) > 10 && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.amber, fontStyle: 'italic' }}>
              Your bond allocation is {(targetBonds - bondsPct).toFixed(0)}% below the age-based target.
            </div>
          )}
        </div>
      </div>

      {/* Smart Suggestions */}
      {suggestions?.suggestions?.length > 0 && (
        <div style={{ ...cardStyle }}>
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            aria-expanded={showSuggestions}
            aria-controls="rebalance-suggestions-body"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, color: C.text,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Rebalancing Suggestions</span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#fff',
                background: C.amber, borderRadius: 10, padding: '2px 8px',
              }}>
                {suggestions.suggestions.length}
              </span>
            </div>
            <span aria-hidden="true" style={{ fontSize: 14, color: C.textMuted, transform: showSuggestions ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              &#9660;
            </span>
          </button>

          {showSuggestions && (
            <div id="rebalance-suggestions-body" style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.suggestions.map((s, i) => (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: C.bg, border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${severityColors[s.severity] || C.textMuted}`,
                }}>
                  <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>{s.message}</div>
                  {s.action && (
                    <div style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>{s.action}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
