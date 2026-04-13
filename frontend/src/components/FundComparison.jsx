import { useState, useEffect } from 'react';
import { C, MONO, ASSET_CLASS_LABELS, ASSET_CLASS_COLORS, TICKER_COLORS } from '../styles/theme';
import { cardStyle } from '../styles/shared';
import { api } from '../hooks/useApi';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

/**
 * Side-by-side fund comparison within the same asset class.
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings
 */
export default function FundComparison({ holdings }) {
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTickers, setSelectedTickers] = useState([]);
  const [fundamentals, setFundamentals] = useState({});
  const [priceData, setPriceData] = useState({});
  const [period, setPeriod] = useState('1y');
  const [loading, setLoading] = useState(false);

  // Group holdings by asset_class — only show classes with 2+ holdings
  const classFunds = {};
  for (const h of holdings) {
    const ac = h.asset_class || 'unclassified';
    if (!classFunds[ac]) classFunds[ac] = [];
    classFunds[ac].push(h);
  }
  const comparableClasses = Object.entries(classFunds).filter(([, funds]) => funds.length >= 2);

  // Auto-select first comparable class — once, on initial mount when nothing is selected.
  // Guard with functional setState so we don't clobber a user's explicit selection.
  useEffect(() => {
    if (comparableClasses.length === 0) return;
    const firstKey = comparableClasses[0][0];
    setSelectedClass(prev => prev || firstKey);
  }, [comparableClasses.length]);

  const fundsInClass = classFunds[selectedClass] || [];

  // Fetch fundamentals for selected tickers
  useEffect(() => {
    if (selectedTickers.length < 2) return;
    setLoading(true);
    const fetches = selectedTickers
      .filter(t => !fundamentals[t])
      .filter(t => {
        const h = holdings.find(h2 => h2.ticker === t);
        return h && !h.is_manual;
      })
      .map(t => api.getFundamentals(t).then(data => ({ ticker: t, data })).catch(() => ({ ticker: t, data: {} })));

    Promise.all(fetches).then(results => {
      const byTicker = {};
      for (const { ticker, data } of results) {
        byTicker[ticker] = data;
      }
      setFundamentals(prev => ({ ...prev, ...byTicker }));
      setLoading(false);
    });
  }, [selectedTickers.join(',')]);

  // Fetch price history for chart overlay
  useEffect(() => {
    if (selectedTickers.length < 2) return;
    const fetches = selectedTickers
      .filter(t => {
        const h = holdings.find(h2 => h2.ticker === t);
        return h && !h.is_manual;
      })
      .map(t => api.getPriceHistory(t, period).then(data => ({ ticker: t, data })).catch(() => ({ ticker: t, data: [] })));

    Promise.all(fetches).then(results => {
      const newPriceData = {};
      for (const { ticker, data } of results) {
        newPriceData[ticker] = data;
      }
      setPriceData(newPriceData);
    });
  }, [selectedTickers.join(','), period]);

  const toggleTicker = (ticker) => {
    setSelectedTickers(prev => {
      if (prev.includes(ticker)) return prev.filter(t => t !== ticker);
      if (prev.length >= 3) return prev;
      return [...prev, ticker];
    });
  };

  if (comparableClasses.length === 0) return null;

  // Build normalized chart data
  const chartData = [];
  const chartTickers = selectedTickers.filter(t => priceData[t]?.length > 0);
  if (chartTickers.length >= 2) {
    const basePrices = {};
    for (const t of chartTickers) {
      if (priceData[t]?.[0]?.close) basePrices[t] = priceData[t][0].close;
    }

    const maxLen = Math.max(...chartTickers.map(t => priceData[t]?.length || 0));
    for (let i = 0; i < maxLen; i++) {
      const point = {};
      for (const t of chartTickers) {
        const d = priceData[t]?.[i];
        if (d && basePrices[t]) {
          point[t] = parseFloat(((d.close / basePrices[t] - 1) * 100).toFixed(2));
          if (i === 0 || !point.date) point.date = d.date;
        }
      }
      if (point.date) chartData.push(point);
    }
  }

  const getDisplayName = (ticker) => {
    const h = holdings.find(h2 => h2.ticker === ticker);
    return h?.is_manual && h?.manual_name ? h.manual_name : ticker;
  };

  const fmtVal = (v, suffix = '') => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return `${(v * 100).toFixed(2)}%${suffix}`;
    return String(v);
  };

  const fmtPct = (v) => {
    if (v === null || v === undefined) return '—';
    return `${(v * 100).toFixed(1)}%`;
  };

  const metrics = [
    { label: 'Dividend Yield', key: 'dividendYield', fmt: fmtPct },
    { label: 'P/E Ratio', key: 'trailingPE', fmt: v => v != null ? v.toFixed(1) : '—' },
    { label: 'Beta (3Y)', key: 'beta', fmt: v => v != null ? v.toFixed(2) : '—' },
    { label: 'Market Cap', key: 'marketCap', fmt: v => v != null ? `$${(v / 1e9).toFixed(1)}B` : '—' },
    { label: 'Expense Ratio', key: 'expenseRatio', fmt: v => v != null ? `${(v * 100).toFixed(2)}%` : '—' },
    { label: '52W High', key: 'fiftyTwoWeekHigh', fmt: v => v != null ? `$${v.toFixed(2)}` : '—' },
    { label: '52W Low', key: 'fiftyTwoWeekLow', fmt: v => v != null ? `$${v.toFixed(2)}` : '—' },
  ];

  return (
    <div style={{ ...cardStyle }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
        Fund Comparison
      </div>

      {/* Class selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {comparableClasses.map(([key, funds]) => (
          <button
            key={key}
            onClick={() => { setSelectedClass(key); setSelectedTickers([]); }}
            style={{
              padding: '6px 12px', minHeight: 36, borderRadius: 6, border: 'none',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: selectedClass === key ? (ASSET_CLASS_COLORS[key] || C.accent) : C.bg,
              color: selectedClass === key ? '#fff' : C.textMuted,
            }}
          >
            {ASSET_CLASS_LABELS[key] || key} ({funds.length})
          </button>
        ))}
      </div>

      {/* Fund selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {fundsInClass.map((h, i) => {
          const selected = selectedTickers.includes(h.ticker);
          const name = getDisplayName(h.ticker);
          return (
            <button
              key={h.ticker}
              onClick={() => toggleTicker(h.ticker)}
              style={{
                padding: '8px 14px', minHeight: 40, borderRadius: 8, cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                border: selected ? 'none' : `1px solid ${C.border}`,
                background: selected ? TICKER_COLORS[i % TICKER_COLORS.length] : 'transparent',
                color: selected ? '#fff' : C.textMuted,
                opacity: !selected && selectedTickers.length >= 3 ? 0.4 : 1,
              }}
            >
              {name}
            </button>
          );
        })}
      </div>

      {selectedTickers.length < 2 && (
        <div style={{ padding: 16, textAlign: 'center', color: C.textDim, fontSize: 12, background: C.bg, borderRadius: 8 }}>
          Select at least 2 funds to compare
        </div>
      )}

      {selectedTickers.length >= 2 && (
        <>
          {/* Normalized price chart */}
          {chartData.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: C.textMuted }}>Normalized % Change</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['3m', '6m', '1y'].map(p => (
                    <button key={p} onClick={() => setPeriod(p)} style={{
                      padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 10,
                      background: period === p ? C.accent : C.bg, color: period === p ? '#fff' : C.textMuted,
                      cursor: 'pointer',
                    }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.textDim }} tickFormatter={d => d?.substring(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: C.textDim }} tickFormatter={v => `${v}%`} width={45} />
                  <Tooltip
                    contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }}
                    cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }}
                    formatter={(v, name) => [`${v}%`, getDisplayName(name)]}
                    labelFormatter={l => l}
                  />
                  <Legend formatter={v => getDisplayName(v)} wrapperStyle={{ fontSize: 10 }} />
                  {chartTickers.map((t, i) => (
                    <Line key={t} dataKey={t} stroke={TICKER_COLORS[fundsInClass.findIndex(h => h.ticker === t) % TICKER_COLORS.length]} dot={false} strokeWidth={2} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Metrics table */}
          {!loading && (
            <div data-no-swipe style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: C.textMuted, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>Metric</th>
                    {selectedTickers.map((t, i) => (
                      <th key={t} style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 700, fontFamily: MONO, borderBottom: `1px solid ${C.border}`, color: TICKER_COLORS[fundsInClass.findIndex(h => h.ticker === t) % TICKER_COLORS.length] }}>
                        {getDisplayName(t)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Portfolio metrics */}
                  <tr>
                    <td style={{ padding: '6px 10px', color: C.textMuted }}>Current Price</td>
                    {selectedTickers.map(t => {
                      const h = holdings.find(h2 => h2.ticker === t);
                      return <td key={t} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: MONO, color: C.text }}>${h?.current_price?.toFixed(2) || '—'}</td>;
                    })}
                  </tr>
                  <tr style={{ background: C.bg }}>
                    <td style={{ padding: '6px 10px', color: C.textMuted }}>Your G/L %</td>
                    {selectedTickers.map(t => {
                      const h = holdings.find(h2 => h2.ticker === t);
                      const gl = h?.gain_loss_pct || 0;
                      return <td key={t} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: MONO, color: gl >= 0 ? C.green : C.red }}>{gl.toFixed(2)}%</td>;
                    })}
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', color: C.textMuted }}>Allocation</td>
                    {selectedTickers.map(t => {
                      const h = holdings.find(h2 => h2.ticker === t);
                      return <td key={t} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: MONO, color: C.text }}>{h?.actual_allocation?.toFixed(1) || '—'}%</td>;
                    })}
                  </tr>
                  {/* Fundamental metrics */}
                  {metrics.map((m, idx) => (
                    <tr key={m.key} style={{ background: idx % 2 === 0 ? C.bg : 'transparent' }}>
                      <td style={{ padding: '6px 10px', color: C.textMuted }}>{m.label}</td>
                      {selectedTickers.map(t => {
                        const f = fundamentals[t] || {};
                        const val = f[m.key];
                        return (
                          <td key={t} style={{ padding: '6px 10px', textAlign: 'right', fontFamily: MONO, color: C.text }}>
                            {m.fmt(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {loading && (
            <div style={{ padding: 16, textAlign: 'center', color: C.textDim, fontSize: 12 }}>Loading fund data...</div>
          )}
        </>
      )}
    </div>
  );
}
