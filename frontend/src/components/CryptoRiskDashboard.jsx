import { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area, ReferenceLine } from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import { displayCoin, fmtPrice, fmtK } from './CryptoView';

const CRYPTO_ACCENT = '#F7931A';
const LS_KEY = 'crypto_risk_categories';

function loadCategories() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveCategories(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function defaultCategory(ticker, marketCap) {
  const coin = displayCoin(ticker);
  if (['BTC', 'ETH'].includes(coin)) return 'Large Cap';
  if (['SOL', 'XRP', 'ADA', 'BNB', 'DOGE', 'AVAX', 'DOT', 'LINK', 'MATIC'].includes(coin)) return 'Mid Cap';
  if (['SHIB', 'PEPE', 'FLOKI', 'BONK'].includes(coin)) return 'Meme';
  if (marketCap && marketCap > 10e9) return 'Large Cap';
  if (marketCap && marketCap > 1e9) return 'Mid Cap';
  return 'Altcoin';
}

const RISK_THRESHOLDS = { 'Large Cap': 8, 'Mid Cap': 12, 'Altcoin': 18, 'Small Cap': 22, 'Meme': 30 };

function riskLevel(volatility, category) {
  const threshold = RISK_THRESHOLDS[category] || 15;
  if (volatility > threshold * 1.5) return { level: 'Very High', color: C.red };
  if (volatility > threshold) return { level: 'High', color: C.red };
  if (volatility > threshold * 0.6) return { level: 'Medium', color: C.amber };
  return { level: 'Low', color: C.green };
}

export default function CryptoRiskDashboard({ holdings, totalCryptoValue }) {
  const [categories, setCategories] = useState(loadCategories);
  const [perfData, setPerfData] = useState(null);
  const [riskPerTrade, setRiskPerTrade] = useState(2);
  const [stopLoss, setStopLoss] = useState(10);
  const [selectedCoin, setSelectedCoin] = useState(holdings[0]?.ticker || '');
  const [priceHistories, setPriceHistories] = useState({});

  // Fetch portfolio performance for drawdown
  useEffect(() => {
    api.getPerformance('crypto').then(setPerfData).catch(() => {});
  }, []);

  // Fetch price histories for volatility
  const fetchPriceHistory = useCallback(async (ticker) => {
    if (priceHistories[ticker]) return;
    try {
      const data = await api.getPriceHistory(ticker, '3m');
      setPriceHistories(prev => ({ ...prev, [ticker]: data }));
    } catch {}
  }, [priceHistories]);

  useEffect(() => {
    holdings.forEach(h => fetchPriceHistory(h.ticker));
  }, [holdings]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateCategory = (ticker, cat) => {
    const next = { ...categories, [ticker]: cat };
    setCategories(next);
    saveCategories(next);
  };

  // Concentration data
  const concData = useMemo(() =>
    holdings.map(h => ({
      coin: displayCoin(h.ticker),
      ticker: h.ticker,
      pct: totalCryptoValue ? (h.market_value / totalCryptoValue) * 100 : 0,
      value: h.market_value || 0,
    })).sort((a, b) => b.pct - a.pct), [holdings, totalCryptoValue]);

  const maxConcentration = concData.length ? concData[0].pct : 0;
  const concRisk = maxConcentration > 50 ? 'HIGH' : maxConcentration > 30 ? 'ELEVATED' : 'OK';

  // Drawdown calculations
  const drawdown = useMemo(() => {
    if (!perfData?.portfolio_values?.length) return null;
    const values = perfData.portfolio_values;
    const dates = perfData.dates;
    let peak = 0;
    let maxDD = 0;
    let currentDD = 0;
    let peakIdx = 0;
    let ddStartIdx = 0;

    for (let i = 0; i < values.length; i++) {
      if (values[i] > peak) { peak = values[i]; peakIdx = i; }
      const dd = peak > 0 ? ((peak - values[i]) / peak) * 100 : 0;
      if (dd > maxDD) { maxDD = dd; ddStartIdx = peakIdx; }
      if (i === values.length - 1) currentDD = dd;
    }

    const lastVal = values[values.length - 1];
    const recoveryNeeded = currentDD > 0 && lastVal > 0 ? ((peak - lastVal) / lastVal) * 100 : 0;

    // Days in drawdown
    let daysInDD = 0;
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] >= peak) break;
      daysInDD++;
    }

    // Chart data (last 30 points)
    const chartSlice = Math.max(0, values.length - 60);
    const chartData = values.slice(chartSlice).map((v, i) => ({
      date: dates[chartSlice + i],
      value: v,
    }));

    return {
      current: currentDD,
      max30d: maxDD,
      recoveryNeeded,
      daysInDD,
      peak,
      chartData,
    };
  }, [perfData]);

  // Volatility calculations
  const volatilityData = useMemo(() => {
    return holdings.map(h => {
      const history = priceHistories[h.ticker];
      let vol30d = 0;
      if (history?.length > 5) {
        const returns = [];
        for (let i = 1; i < history.length; i++) {
          if (history[i].close && history[i - 1].close) {
            returns.push((history[i].close - history[i - 1].close) / history[i - 1].close);
          }
        }
        if (returns.length > 1) {
          const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
          const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
          vol30d = Math.sqrt(variance) * 100; // daily vol as %
        }
      }
      const cat = categories[h.ticker] || defaultCategory(h.ticker, null);
      const risk = riskLevel(vol30d, cat);
      return {
        coin: displayCoin(h.ticker),
        ticker: h.ticker,
        category: cat,
        volatility: vol30d,
        risk,
      };
    });
  }, [holdings, priceHistories, categories]);

  // Position sizing
  const selectedHolding = holdings.find(h => h.ticker === selectedCoin);
  const currentPrice = selectedHolding?.current_price || 0;
  const maxPositionUSD = totalCryptoValue * (riskPerTrade / 100) / (stopLoss / 100);
  const maxCoins = currentPrice > 0 ? maxPositionUSD / currentPrice : 0;

  // Overall risk score (0-100)
  const riskScore = useMemo(() => {
    let score = 0;
    // Concentration (0-40)
    if (maxConcentration > 80) score += 40;
    else if (maxConcentration > 50) score += 30;
    else if (maxConcentration > 30) score += 20;
    else score += 10;
    // Drawdown (0-30)
    if (drawdown) {
      if (drawdown.current > 30) score += 30;
      else if (drawdown.current > 15) score += 20;
      else if (drawdown.current > 5) score += 10;
    }
    // Volatility (0-30)
    const avgVol = volatilityData.length ? volatilityData.reduce((s, v) => s + v.volatility, 0) / volatilityData.length : 0;
    if (avgVol > 10) score += 30;
    else if (avgVol > 5) score += 20;
    else if (avgVol > 2) score += 10;
    return Math.min(100, score);
  }, [maxConcentration, drawdown, volatilityData]);

  const scoreColor = riskScore > 70 ? C.red : riskScore > 40 ? C.amber : C.green;
  const scoreLabel = riskScore > 70 ? 'High Risk' : riskScore > 40 ? 'Moderate Risk' : 'Low Risk';

  return (
    <div>
      {/* Overall Risk Score */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${scoreColor}33`, padding: 20, marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 8 }}>Portfolio Risk Score</div>
        <div style={{ fontSize: 48, fontWeight: 800, color: scoreColor, fontFamily: MONO }}>{riskScore}</div>
        <div style={{ fontSize: 13, color: scoreColor, fontWeight: 600 }}>{scoreLabel}</div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Based on concentration, drawdown, and volatility</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {/* Section 1: Concentration Risk */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Concentration Risk</h3>
          {concRisk !== 'OK' && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 12, fontWeight: 600,
              background: concRisk === 'HIGH' ? C.red + '22' : C.amber + '22',
              color: concRisk === 'HIGH' ? C.red : C.amber,
              border: `1px solid ${concRisk === 'HIGH' ? C.red : C.amber}33`,
            }}>
              {concRisk === 'HIGH' ? 'HIGH CONCENTRATION RISK' : 'ELEVATED CONCENTRATION'}: {concData[0]?.coin} is {concData[0]?.pct.toFixed(1)}% of portfolio
            </div>
          )}
          <ResponsiveContainer width="100%" height={Math.max(120, concData.length * 32)}>
            <BarChart data={concData} layout="vertical" margin={{ left: 40, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <XAxis type="number" tick={{ fill: C.textDim, fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 100]} />
              <YAxis type="category" dataKey="coin" tick={{ fill: C.text, fontSize: 11, fontWeight: 600, fontFamily: MONO }} width={40} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: CRYPTO_ACCENT }}>{d.coin}</div>
                    <div style={{ fontFamily: MONO, color: C.text }}>{d.pct.toFixed(1)}% — {fmtK(d.value)}</div>
                  </div>
                );
              }} />
              <Bar dataKey="pct" barSize={18} radius={[0, 4, 4, 0]}>
                {concData.map((d, i) => (
                  <Cell key={i} fill={d.pct > 50 ? C.red : d.pct > 30 ? C.amber : CRYPTO_ACCENT} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Section 2: Drawdown Analysis */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Drawdown Analysis</h3>
          {drawdown ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <MetricBox label="Current Drawdown" value={`-${drawdown.current.toFixed(1)}%`} color={drawdown.current > 10 ? C.red : C.amber} />
                <MetricBox label="Max Drawdown" value={`-${drawdown.max30d.toFixed(1)}%`} color={C.red} />
                <MetricBox label="Recovery Needed" value={`+${drawdown.recoveryNeeded.toFixed(1)}%`} color={C.amber} />
                <MetricBox label="Days in Drawdown" value={drawdown.daysInDD} color={drawdown.daysInDD > 30 ? C.red : C.textMuted} />
              </div>
              {drawdown.chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={drawdown.chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                    <defs>
                      <linearGradient id="drawdownGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CRYPTO_ACCENT} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={CRYPTO_ACCENT} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="value" stroke={CRYPTO_ACCENT} strokeWidth={1.5} fill="url(#drawdownGrad)" dot={false} />
                    <ReferenceLine y={drawdown.peak} stroke={C.green} strokeDasharray="3 3" strokeWidth={1} />
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: MONO }}>
                          {fmtK(payload[0].value)}
                        </div>
                      );
                    }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: C.textDim, fontSize: 12 }}>Loading performance data...</div>
          )}
        </div>
      </div>

      {/* Section 3: Position Sizing Calculator */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Position Sizing Calculator</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase' }}>Portfolio Value</label>
            <div style={{ fontSize: 18, fontWeight: 800, color: CRYPTO_ACCENT, fontFamily: MONO, marginTop: 4 }}>{fmtK(totalCryptoValue)}</div>
          </div>
          <div>
            <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase' }}>Risk per Trade: {riskPerTrade}%</label>
            <input type="range" min="0.5" max="5" step="0.5" value={riskPerTrade} onChange={e => setRiskPerTrade(parseFloat(e.target.value))}
              style={{ width: '100%', marginTop: 4, accentColor: CRYPTO_ACCENT }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase' }}>Stop Loss Distance</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <input type="number" value={stopLoss} onChange={e => setStopLoss(Math.max(1, parseFloat(e.target.value) || 1))}
                style={{ padding: '6px 8px', fontSize: 13, fontFamily: MONO, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, outline: 'none', width: 60 }} />
              <span style={{ fontSize: 12, color: C.textMuted }}>%</span>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase' }}>Coin</label>
            <select value={selectedCoin} onChange={e => setSelectedCoin(e.target.value)}
              style={{ display: 'block', marginTop: 4, padding: '6px 8px', fontSize: 13, fontFamily: MONO, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, outline: 'none', cursor: 'pointer' }}>
              {holdings.map(h => <option key={h.id} value={h.ticker}>{displayCoin(h.ticker)}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: C.bg, borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Max Position Size</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: CRYPTO_ACCENT, fontFamily: MONO, marginTop: 4 }}>{fmtK(maxPositionUSD)}</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Risk: ${(totalCryptoValue * riskPerTrade / 100).toFixed(0)} on this trade</div>
          </div>
          <div style={{ background: C.bg, borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Max Coins to Buy</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: MONO, marginTop: 4 }}>{maxCoins.toFixed(4)}</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{displayCoin(selectedCoin)} @ {fmtPrice(currentPrice)}</div>
          </div>
        </div>
      </div>

      {/* Section 4: Risk Classification */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Risk Classification</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Coin', 'Category', 'Daily Volatility', 'Risk Level'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: C.textDim, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {volatilityData.map(v => (
                <tr key={v.ticker} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: MONO }}>{v.coin}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <select value={v.category} onChange={e => updateCategory(v.ticker, e.target.value)}
                      style={{ padding: '2px 6px', fontSize: 11, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, cursor: 'pointer', outline: 'none' }}>
                      {['Large Cap', 'Mid Cap', 'Altcoin', 'Small Cap', 'Meme', 'Stablecoin'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: MONO, color: v.volatility > 8 ? C.red : v.volatility > 4 ? C.amber : C.green }}>
                    {v.volatility.toFixed(2)}%
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: v.risk.color + '22', color: v.risk.color }}>
                      {v.risk.level}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }) {
  return (
    <div style={{ padding: '8px 10px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || C.text, fontFamily: MONO, marginTop: 2 }}>{value}</div>
    </div>
  );
}
