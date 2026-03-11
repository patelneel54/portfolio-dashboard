import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import { displayCoin, fmtPrice, fmtK } from './CryptoView';

const CRYPTO_ACCENT = '#F7931A';
const PERIODS = [
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '1y', label: '1Y' },
];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMarketCap(v) {
  if (!v) return 'N/A';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function formatSupply(v) {
  if (!v) return 'N/A';
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString();
}

function CoinCard({ holding, totalCryptoValue }) {
  const coin = displayCoin(holding.ticker);
  const [period, setPeriod] = useState('3m');
  const [priceData, setPriceData] = useState({});
  const [fundamentals, setFundamentals] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPriceHistory = useCallback(async (p) => {
    if (priceData[p]) return;
    setLoading(true);
    try {
      const data = await api.getPriceHistory(holding.ticker, p);
      setPriceData(prev => ({ ...prev, [p]: data }));
    } catch (err) {
      console.error(`Failed to fetch price history for ${holding.ticker}:`, err);
    } finally {
      setLoading(false);
    }
  }, [holding.ticker, priceData]);

  useEffect(() => {
    fetchPriceHistory(period);
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.getFundamentals(holding.ticker).then(setFundamentals).catch(() => {});
  }, [holding.ticker]);

  const chartData = priceData[period] || [];
  const startPrice = chartData.length > 0 ? chartData[0].close : null;
  const endPrice = chartData.length > 0 ? chartData[chartData.length - 1].close : null;
  const periodChange = startPrice && endPrice ? ((endPrice - startPrice) / startPrice) * 100 : 0;
  const gainColor = periodChange >= 0 ? C.green : C.red;

  const tickCount = 5;
  const step = Math.max(1, Math.floor(chartData.length / tickCount));
  const xTicks = chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1).map(d => d.date);

  const gl = holding.gain_loss || 0;
  const glPct = holding.gain_loss_pct || 0;
  const portfolioPct = totalCryptoValue ? ((holding.market_value / totalCryptoValue) * 100) : 0;

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 }}>
      {/* Coin Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 8, background: CRYPTO_ACCENT + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: CRYPTO_ACCENT, fontFamily: MONO }}>
            {coin.charAt(0)}
          </span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, fontFamily: MONO }}>{coin}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{portfolioPct.toFixed(1)}% of portfolio</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: MONO }}>{fmtPrice(holding.current_price || 0)}</div>
          <div style={{ fontSize: 12, fontFamily: MONO, color: glPct >= 0 ? C.green : C.red }}>
            {glPct >= 0 ? '+' : ''}{glPct.toFixed(1)}% ({gl >= 0 ? '+' : ''}{fmtK(Math.abs(gl))})
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: gainColor }}>
          {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}%
          <span style={{ color: C.textDim, fontWeight: 400, marginLeft: 6, fontSize: 10 }}>
            {PERIODS.find(p => p.key === period)?.label}
          </span>
        </span>
        <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 6, padding: 2 }}>
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: '8px 10px', borderRadius: 4, border: 'none',
                fontSize: 11, fontWeight: 600, fontFamily: MONO, cursor: 'pointer', minHeight: 44,
                background: period === p.key ? CRYPTO_ACCENT : 'transparent',
                color: period === p.key ? '#fff' : C.textDim,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Price Chart */}
      {loading && !chartData.length ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 12 }}>
          Loading chart...
        </div>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${holding.ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={gainColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={gainColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis
              dataKey="date" tick={{ fill: C.textDim, fontSize: 9 }}
              axisLine={{ stroke: C.border }} tickLine={false}
              ticks={xTicks} tickFormatter={formatDate}
            />
            <YAxis
              tick={{ fill: C.textDim, fontSize: 9, fontFamily: MONO }}
              axisLine={false} tickLine={false}
              domain={['auto', 'auto']}
              tickFormatter={v => fmtPrice(v)}
              width={60}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background: '#0f1729', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 11, fontFamily: MONO }}>
                    <div style={{ color: C.textDim, marginBottom: 4 }}>{formatDate(label)}</div>
                    <div style={{ color: C.text, fontWeight: 600 }}>{fmtPrice(payload[0].value)}</div>
                  </div>
                );
              }}
            />
            <Area
              type="monotone" dataKey="close"
              stroke={gainColor} strokeWidth={2}
              fill={`url(#grad-${holding.ticker})`}
              dot={false} animationDuration={400}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 12 }}>
          No price history available
        </div>
      )}

      {/* Market Data Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginTop: 12 }}>
        <div style={{ padding: '8px 10px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>Market Cap</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: C.text, marginTop: 2 }}>
            {formatMarketCap(fundamentals?.market_cap)}
          </div>
        </div>
        <div style={{ padding: '8px 10px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>24h Volume</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: C.text, marginTop: 2 }}>
            {formatMarketCap(fundamentals?.volume_24h)}
          </div>
        </div>
        <div style={{ padding: '8px 10px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>Circulating</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: C.text, marginTop: 2 }}>
            {formatSupply(fundamentals?.circulating_supply)}
          </div>
        </div>
        <div style={{ padding: '8px 10px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>Holdings</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: C.text, marginTop: 2 }}>
            {holding.shares} {coin}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CryptoOverview({ holdings, totalCryptoValue }) {
  return (
    <div>
      {holdings.map(h => (
        <CoinCard key={h.id} holding={h} totalCryptoValue={totalCryptoValue} />
      ))}
    </div>
  );
}
