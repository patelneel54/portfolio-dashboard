import { useState, useEffect, useMemo, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import { displayCoin, fmtPrice } from './CryptoView';

const CRYPTO_ACCENT = '#F7931A';
const LS_MACRO_KEY = 'crypto_macro_notes';

function loadMacro() {
  try { return JSON.parse(localStorage.getItem(LS_MACRO_KEY) || '{}'); } catch { return {}; }
}
function saveMacro(data) {
  localStorage.setItem(LS_MACRO_KEY, JSON.stringify(data));
}

function formatMarketCap(v) {
  if (!v) return 'N/A';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

const FNG_COLORS = {
  'Extreme Fear': '#ef4444',
  'Fear': '#f97316',
  'Neutral': '#eab308',
  'Greed': '#22c55e',
  'Extreme Greed': '#10b981',
};

export default function CryptoMarketContext({ holdings }) {
  const [fearGreed, setFearGreed] = useState(null);
  const [globalData, setGlobalData] = useState(null);
  const [btcTechnicals, setBtcTechnicals] = useState(null);
  const [macro, setMacro] = useState(loadMacro);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState(holdings.find(h => displayCoin(h.ticker) !== 'BTC')?.ticker || holdings[0]?.ticker || '');
  const [coinPrices, setCoinPrices] = useState(null);
  const [btcPrices, setBtcPrices] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [fg, gd, bt] = await Promise.all([
        api.getFearGreed().catch(() => null),
        api.getCryptoGlobal().catch(() => null),
        api.getTechnicals('BTC-USD').catch(() => null),
      ]);
      setFearGreed(fg);
      setGlobalData(gd);
      setBtcTechnicals(bt);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Fetch price histories for correlation
  useEffect(() => {
    if (!selectedCoin) return;
    Promise.all([
      api.getPriceHistory(selectedCoin, '3m').catch(() => []),
      api.getPriceHistory('BTC-USD', '3m').catch(() => []),
    ]).then(([cp, bp]) => {
      setCoinPrices(cp);
      setBtcPrices(bp);
    });
  }, [selectedCoin]);

  const updateMacro = (field, value) => {
    const next = { ...macro, [field]: value };
    setMacro(next);
    saveMacro(next);
  };

  // Correlation calculation
  const correlation = useMemo(() => {
    if (!coinPrices?.length || !btcPrices?.length) return null;
    // Build date-aligned return arrays
    const coinMap = {};
    coinPrices.forEach(p => { coinMap[p.date] = p.close; });
    const btcMap = {};
    btcPrices.forEach(p => { btcMap[p.date] = p.close; });

    const dates = Object.keys(coinMap).filter(d => btcMap[d]).sort();
    if (dates.length < 10) return null;

    const coinReturns = [];
    const btcReturns = [];
    for (let i = 1; i < dates.length; i++) {
      const cr = (coinMap[dates[i]] - coinMap[dates[i - 1]]) / coinMap[dates[i - 1]];
      const br = (btcMap[dates[i]] - btcMap[dates[i - 1]]) / btcMap[dates[i - 1]];
      coinReturns.push(cr);
      btcReturns.push(br);
    }

    const n = coinReturns.length;
    const meanC = coinReturns.reduce((s, r) => s + r, 0) / n;
    const meanB = btcReturns.reduce((s, r) => s + r, 0) / n;
    let cov = 0, varC = 0, varB = 0;
    for (let i = 0; i < n; i++) {
      cov += (coinReturns[i] - meanC) * (btcReturns[i] - meanB);
      varC += (coinReturns[i] - meanC) ** 2;
      varB += (btcReturns[i] - meanB) ** 2;
    }
    if (varC === 0 || varB === 0) return null;
    return cov / Math.sqrt(varC * varB);
  }, [coinPrices, btcPrices]);

  const fngValue = fearGreed?.current?.value || 0;
  const fngClass = fearGreed?.current?.classification || 'N/A';
  const fngColor = FNG_COLORS[fngClass] || C.textMuted;
  const fng30dAvg = fearGreed?.history?.length
    ? (fearGreed.history.reduce((s, e) => s + e.value, 0) / fearGreed.history.length).toFixed(0)
    : '-';

  // Fear & Greed chart data
  const fngChartData = useMemo(() =>
    (fearGreed?.history || []).slice().reverse().map(e => ({ date: e.date, value: e.value })),
    [fearGreed]);

  // BTC dominance interpretation
  const btcDom = globalData?.btc_dominance || 0;
  const btcDomLabel = btcDom > 55 ? 'Altcoin season unlikely' : btcDom < 45 ? 'Altcoin season possible' : 'Neutral territory';

  const inputStyle = {
    width: '100%', padding: '6px 10px', fontSize: 12, fontFamily: MONO,
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div>
      {/* Refresh bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: C.textDim }}>
          {lastRefresh ? `Last refreshed: ${lastRefresh.toLocaleTimeString()}` : 'Loading...'}
        </span>
        <button onClick={fetchAll} disabled={loading} style={{
          padding: '10px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
          fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.textMuted, minHeight: 44,
          opacity: loading ? 0.5 : 1,
        }}>
          Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Panel 1: Fear & Greed */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: C.textMuted }}>Fear & Greed Index</h3>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 56, fontWeight: 700, color: fngColor, fontFamily: MONO }}>{fngValue}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: fngColor }}>{fngClass}</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>30-day average: {fng30dAvg}</div>
            {/* Gauge bar */}
            <div style={{ marginTop: 10, height: 8, borderRadius: 4, background: C.bg, position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 4,
                width: `${fngValue}%`,
                background: `linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #10b981)`,
              }} />
            </div>
          </div>
          {fngChartData.length > 0 && (
            <ResponsiveContainer width="100%" height={80}>
              <AreaChart data={fngChartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <Area type="monotone" dataKey="value" stroke={fngColor} strokeWidth={1.5} fill={fngColor} fillOpacity={0.1} dot={false} />
                <XAxis dataKey="date" hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: MONO }}>
                      {payload[0].payload.date}: {payload[0].value}
                    </div>
                  );
                }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Panel 2: BTC Dominance */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: C.textMuted }}>BTC Dominance</h3>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 42, fontWeight: 700, color: CRYPTO_ACCENT, fontFamily: MONO }}>{btcDom.toFixed(1)}%</div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{btcDomLabel}</div>
          </div>
          <InfoRow label="ETH Dominance" value={`${(globalData?.eth_dominance || 0).toFixed(1)}%`} />
          <InfoRow label="Active Cryptos" value={(globalData?.active_cryptocurrencies || 0).toLocaleString()} />
        </div>

        {/* Panel 3: Total Crypto Market Cap */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: C.textMuted }}>Total Market Cap</h3>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: C.text, fontFamily: MONO }}>{formatMarketCap(globalData?.total_market_cap_usd)}</div>
            <div style={{
              fontSize: 12, marginTop: 4, fontFamily: MONO, fontWeight: 600,
              color: (globalData?.market_cap_change_24h_pct || 0) >= 0 ? C.green : C.red,
            }}>
              {(globalData?.market_cap_change_24h_pct || 0) >= 0 ? '+' : ''}{(globalData?.market_cap_change_24h_pct || 0).toFixed(2)}% (24h)
            </div>
          </div>
          <InfoRow label="24h Volume" value={formatMarketCap(globalData?.total_volume_24h_usd)} />
        </div>

        {/* Panel 4: BTC Price + Key Levels */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: C.textMuted }}>BTC Key Levels</h3>
          {btcTechnicals ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: CRYPTO_ACCENT, fontFamily: MONO }}>{fmtPrice(btcTechnicals.price || 0)}</div>
                <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>Trend: <span style={{ color: btcTechnicals.trend?.includes('Bullish') ? C.green : btcTechnicals.trend?.includes('Bearish') ? C.red : C.amber, fontWeight: 600 }}>{btcTechnicals.trend}</span></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <LevelBox label="50-Day MA" value={fmtPrice(btcTechnicals.sma50 || 0)} above={btcTechnicals.price > btcTechnicals.sma50} />
                <LevelBox label="200-Day MA" value={fmtPrice(btcTechnicals.sma200 || 0)} above={btcTechnicals.price > btcTechnicals.sma200} />
                <LevelBox label="RSI (14)" value={(btcTechnicals.rsi || 0).toFixed(1)} above={btcTechnicals.rsi < 70} neutral />
                <LevelBox label="Support" value={fmtPrice(btcTechnicals.support?.[0] || 0)} above={btcTechnicals.price > (btcTechnicals.support?.[0] || 0)} />
              </div>
            </>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: C.textDim, fontSize: 12 }}>Loading BTC data...</div>
          )}
        </div>

        {/* Panel 5: Macro Snapshot */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: C.textMuted }}>Macro Snapshot</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Fed Rate</label>
              <input value={macro.fedRate || ''} onChange={e => updateMacro('fedRate', e.target.value)} placeholder="5.25%" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Next FOMC</label>
              <input value={macro.nextFomc || ''} onChange={e => updateMacro('nextFomc', e.target.value)} placeholder="Mar 19, 2026" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>CPI Last</label>
              <input value={macro.cpi || ''} onChange={e => updateMacro('cpi', e.target.value)} placeholder="3.1%" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>DXY</label>
              <input value={macro.dxy || ''} onChange={e => updateMacro('dxy', e.target.value)} placeholder="104.5" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Notes</label>
            <textarea value={macro.notes || ''} onChange={e => updateMacro('notes', e.target.value)} placeholder="Market observations..." rows={3} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
        </div>

        {/* Panel 6: Correlation vs BTC */}
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: C.textMuted }}>Correlation vs BTC</h3>
          <div style={{ marginBottom: 12 }}>
            <select value={selectedCoin} onChange={e => setSelectedCoin(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 12, fontFamily: MONO, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, cursor: 'pointer', outline: 'none' }}>
              {holdings.filter(h => displayCoin(h.ticker) !== 'BTC').map(h => (
                <option key={h.id} value={h.ticker}>{displayCoin(h.ticker)}</option>
              ))}
            </select>
          </div>
          {correlation !== null ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 42, fontWeight: 700, fontFamily: MONO, color: Math.abs(correlation) > 0.7 ? CRYPTO_ACCENT : C.textMuted }}>
                {correlation.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                {Math.abs(correlation) > 0.8 ? `${displayCoin(selectedCoin)} moves very closely with BTC`
                  : Math.abs(correlation) > 0.5 ? `${displayCoin(selectedCoin)} has moderate correlation with BTC`
                  : `${displayCoin(selectedCoin)} moves somewhat independently of BTC`}
              </div>
              {/* Correlation bar */}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: C.textDim }}>-1</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.bg, position: 'relative' }}>
                  <div style={{
                    position: 'absolute', top: -3, width: 12, height: 12, borderRadius: '50%',
                    background: CRYPTO_ACCENT,
                    left: `${((correlation + 1) / 2) * 100}%`,
                    transform: 'translateX(-50%)',
                  }} />
                </div>
                <span style={{ fontSize: 10, color: C.textDim }}>+1</span>
              </div>
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: C.textDim, fontSize: 12 }}>
              {holdings.filter(h => displayCoin(h.ticker) !== 'BTC').length === 0
                ? 'Add more coins to see correlation'
                : 'Loading correlation data...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${C.border}22`, marginTop: 8 }}>
      <span style={{ fontSize: 11, color: C.textDim }}>{label}</span>
      <span style={{ fontSize: 11, color: C.text, fontFamily: MONO, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function LevelBox({ label, value, above, neutral }) {
  const color = neutral ? (above ? C.textMuted : C.amber) : (above ? C.green : C.red);
  const signal = neutral ? '' : (above ? 'Above' : 'Below');
  return (
    <div style={{ padding: '6px 8px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: MONO, marginTop: 2 }}>{value}</div>
      {signal && <div style={{ fontSize: 9, color, fontWeight: 600, marginTop: 1 }}>{signal}</div>}
    </div>
  );
}
