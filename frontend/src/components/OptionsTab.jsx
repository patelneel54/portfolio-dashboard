import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { C, MONO, SANS, TICKER_COLORS } from '../styles/theme';
import { cardStyle } from '../styles/shared';

/* ── Black-Scholes math utilities ─────────────────────────────── */

function normCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}

function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function calcD1(S, K, T, r, sigma) {
  return (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
}

function calcD2(d1, sigma, T) {
  return d1 - sigma * Math.sqrt(T);
}

function callPrice(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(0, S - K);
  const d1 = calcD1(S, K, T, r, sigma);
  const d2 = calcD2(d1, sigma, T);
  return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
}

function putPrice(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(0, K - S);
  const d1 = calcD1(S, K, T, r, sigma);
  const d2 = calcD2(d1, sigma, T);
  return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
}

function calcDelta(S, K, T, r, sigma, type = 'call') {
  if (T <= 0) return type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = calcD1(S, K, T, r, sigma);
  return type === 'call' ? normCDF(d1) : normCDF(d1) - 1;
}

function calcGamma(S, K, T, r, sigma) {
  if (T <= 0) return 0;
  const d1 = calcD1(S, K, T, r, sigma);
  return normPDF(d1) / (S * sigma * Math.sqrt(T));
}

function calcTheta(S, K, T, r, sigma, type = 'call') {
  if (T <= 0) return 0;
  const d1 = calcD1(S, K, T, r, sigma);
  const d2 = calcD2(d1, sigma, T);
  const term1 = -(S * normPDF(d1) * sigma) / (2 * Math.sqrt(T));
  if (type === 'call') {
    return (term1 - r * K * Math.exp(-r * T) * normCDF(d2)) / 365;
  }
  return (term1 + r * K * Math.exp(-r * T) * normCDF(-d2)) / 365;
}

function calcVega(S, K, T, r, sigma) {
  if (T <= 0) return 0;
  const d1 = calcD1(S, K, T, r, sigma);
  return (S * Math.sqrt(T) * normPDF(d1)) / 100;
}

/* ── P&L payoff data generator ────────────────────────────────── */

function generatePayoffData(strategy, params) {
  const { stockPrice, strike, strike2, premium, premium2 } = params;
  const points = [];
  const minPrice = stockPrice * 0.65;
  const maxPrice = stockPrice * 1.35;
  const step = (maxPrice - minPrice) / 200;

  for (let price = minPrice; price <= maxPrice; price += step) {
    let pnl;
    switch (strategy) {
      case 'long_call':
        pnl = Math.max(0, price - strike) - premium;
        break;
      case 'long_put':
        pnl = Math.max(0, strike - price) - premium;
        break;
      case 'covered_call':
        pnl = (price - stockPrice) + premium - Math.max(0, price - strike);
        break;
      case 'cash_secured_put':
        pnl = premium - Math.max(0, strike - price);
        break;
      case 'bull_call_spread':
        pnl = Math.max(0, price - strike) - Math.max(0, price - strike2) - premium;
        break;
      case 'bear_put_spread':
        pnl = Math.max(0, strike2 - price) - Math.max(0, strike - price) - premium;
        break;
      case 'iron_condor': {
        const putSpread = Math.max(0, strike - price) - Math.max(0, (strike - 5) - price);
        const callSpread = Math.max(0, price - strike2) - Math.max(0, price - (strike2 + 5));
        pnl = premium - putSpread - callSpread;
        break;
      }
      case 'straddle':
        pnl = Math.max(0, price - strike) + Math.max(0, strike - price) - premium;
        break;
      default:
        pnl = 0;
    }
    const pnlDollars = parseFloat((pnl * 100).toFixed(2));
    points.push({
      price: parseFloat(price.toFixed(2)),
      pnl: pnlDollars,
      pnlPos: pnlDollars >= 0 ? pnlDollars : 0,
      pnlNeg: pnlDollars < 0 ? pnlDollars : 0,
    });
  }
  return points;
}

/* ── Strategy definitions ─────────────────────────────────────── */

const STRATEGIES = {
  long_call: {
    name: 'Long Call',
    category: 'basic',
    direction: 'Bullish',
    dirColor: C.green,
    description: 'Buy a call option. Profit when stock rises above strike + premium.',
    bestWhen: 'You think the stock will go UP significantly before expiration.',
    maxProfit: 'Unlimited (stock can rise forever)',
    maxLoss: 'Premium paid (total cost of the option)',
    breakeven: 'Strike + Premium',
    riskLevel: 'Defined',
    riskColor: C.amber,
    legs: 1,
    needsStrike2: false,
  },
  long_put: {
    name: 'Long Put',
    category: 'basic',
    direction: 'Bearish',
    dirColor: C.red,
    description: 'Buy a put option. Profit when stock drops below strike - premium.',
    bestWhen: 'You think the stock will go DOWN significantly before expiration.',
    maxProfit: 'Strike - Premium (if stock goes to $0)',
    maxLoss: 'Premium paid',
    breakeven: 'Strike - Premium',
    riskLevel: 'Defined',
    riskColor: C.amber,
    legs: 1,
    needsStrike2: false,
  },
  covered_call: {
    name: 'Covered Call',
    category: 'basic',
    direction: 'Neutral / Mild Bullish',
    dirColor: C.blue,
    description: 'Own the stock AND sell a call. Collect premium as income.',
    bestWhen: 'You own stock, want income, and think it stays flat or rises slightly.',
    maxProfit: '(Strike - Entry) + Premium received',
    maxLoss: 'Entry Price - Premium (if stock goes to $0)',
    breakeven: 'Entry Price - Premium',
    riskLevel: 'Moderate',
    riskColor: C.blue,
    legs: 1,
    needsStrike2: false,
  },
  cash_secured_put: {
    name: 'Cash-Secured Put',
    category: 'basic',
    direction: 'Neutral / Mild Bullish',
    dirColor: C.blue,
    description: 'Sell a put with cash to cover assignment. Collect premium or buy stock at a discount.',
    bestWhen: 'You want to buy the stock at a lower price, or collect income if it stays above strike.',
    maxProfit: 'Premium received',
    maxLoss: 'Strike - Premium (if stock goes to $0)',
    breakeven: 'Strike - Premium',
    riskLevel: 'Moderate',
    riskColor: C.blue,
    legs: 1,
    needsStrike2: false,
  },
  bull_call_spread: {
    name: 'Bull Call Spread',
    category: 'intermediate',
    direction: 'Bullish',
    dirColor: C.green,
    description: 'Buy a call at a lower strike, sell a call at a higher strike. Caps profit but reduces cost.',
    bestWhen: 'Moderate upside expected. Cheaper than a naked long call.',
    maxProfit: '(Upper Strike - Lower Strike - Net Premium) x 100',
    maxLoss: 'Net premium paid',
    breakeven: 'Lower Strike + Net Premium',
    riskLevel: 'Defined',
    riskColor: C.amber,
    legs: 2,
    needsStrike2: true,
  },
  bear_put_spread: {
    name: 'Bear Put Spread',
    category: 'intermediate',
    direction: 'Bearish',
    dirColor: C.red,
    description: 'Buy a put at a higher strike, sell a put at a lower strike. Caps profit but reduces cost.',
    bestWhen: 'Moderate downside expected. Cheaper than a naked long put.',
    maxProfit: '(Upper Strike - Lower Strike - Net Premium) x 100',
    maxLoss: 'Net premium paid',
    breakeven: 'Upper Strike - Net Premium',
    riskLevel: 'Defined',
    riskColor: C.amber,
    legs: 2,
    needsStrike2: true,
  },
  iron_condor: {
    name: 'Iron Condor',
    category: 'intermediate',
    direction: 'Neutral',
    dirColor: C.amber,
    description: 'Sell a put spread and a call spread. Profit when stock stays in a range.',
    bestWhen: 'You expect the stock to trade sideways within a range.',
    maxProfit: 'Net premium received x 100',
    maxLoss: '(Width of wider spread - Net Premium) x 100',
    breakeven: 'Lower short strike - premium / Upper short strike + premium',
    riskLevel: 'Defined',
    riskColor: C.amber,
    legs: 4,
    needsStrike2: true,
  },
  straddle: {
    name: 'Straddle',
    category: 'intermediate',
    direction: 'Volatile',
    dirColor: '#A855F7',
    description: 'Buy a call AND a put at the same strike. Profit from a big move in either direction.',
    bestWhen: 'You expect a BIG move but are unsure which direction (e.g., before earnings).',
    maxProfit: 'Unlimited (large move in either direction)',
    maxLoss: 'Total premium paid (both legs)',
    breakeven: 'Strike +/- Total Premium',
    riskLevel: 'Defined',
    riskColor: C.amber,
    legs: 2,
    needsStrike2: false,
  },
};

/* ── Greek tooltips ───────────────────────────────────────────── */

const GREEK_TOOLTIPS = {
  delta: {
    symbol: '\u0394',
    short: 'Price sensitivity to stock movement',
    long: 'If delta is 0.55, the option gains $0.55 when the stock rises $1. Think of it as the rough probability the option expires in the money.',
    range: 'Calls: 0 to 1 | Puts: -1 to 0',
    color: C.green,
  },
  gamma: {
    symbol: '\u0393',
    short: 'Rate of change of delta',
    long: 'How fast delta changes. High gamma = your position can swing quickly. Highest for ATM options near expiration.',
    range: 'Always positive, highest at ATM',
    color: C.blue,
  },
  theta: {
    symbol: '\u0398',
    short: 'Daily time decay',
    long: 'Options lose value every day. If theta is -0.05, you lose $5/contract/day. Accelerates near expiration.',
    range: 'Negative for buyers, positive for sellers',
    color: C.red,
  },
  vega: {
    symbol: '\u03BD',
    short: 'Sensitivity to volatility changes',
    long: 'If vega is 0.12, the option gains $0.12 when IV rises 1%. Buy when vol is low, sell when high.',
    range: 'Always positive for long options',
    color: '#A855F7',
  },
};

/* ── Slider style injection ───────────────────────────────────── */

const SLIDER_STYLE_ID = 'options-tab-slider-styles';
function ensureSliderStyles() {
  if (document.getElementById(SLIDER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SLIDER_STYLE_ID;
  style.textContent = `
    .options-slider { -webkit-appearance: none; width: 100%; height: 4px; border-radius: 2px; background: ${C.border}; outline: none; }
    .options-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: ${C.accent}; cursor: pointer; border: 2px solid ${C.bg}; }
    .options-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: ${C.accent}; cursor: pointer; border: 2px solid ${C.bg}; }
  `;
  document.head.appendChild(style);
}

/* ── Custom tooltip ───────────────────────────────────────────── */

const PayoffTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
        Stock: ${d.price.toFixed(2)}
      </div>
      <div style={{
        fontSize: 13, fontWeight: 700, color: d.pnl >= 0 ? C.green : C.red,
        fontFamily: MONO, fontVariantNumeric: 'tabular-nums', marginTop: 2,
      }}>
        P&L: {d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(0)}
      </div>
    </div>
  );
};

/* ── Main component ───────────────────────────────────────────── */

/**
 * Options Strategy Simulator with P&L diagrams, Greeks, and educational cards.
 * All calculations are client-side via Black-Scholes — no backend needed.
 *
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings
 */
export default function OptionsTab({ holdings }) {
  ensureSliderStyles();

  // Strategy selector
  const [selectedStrategy, setSelectedStrategy] = useState('long_call');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Simulation parameters
  const [stockPrice, setStockPrice] = useState(150);
  const [strike, setStrike] = useState(155);
  const [strike2, setStrike2] = useState(165);
  const [premium, setPremium] = useState(3.50);
  const [premium2, setPremium2] = useState(1.20);
  const [daysToExp, setDaysToExp] = useState(30);
  const [iv, setIV] = useState(30);
  const riskFreeRate = 0.05;

  // UI state
  const [expandedGreek, setExpandedGreek] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Ticker quick-select from holdings
  const tickers = useMemo(() =>
    [...new Set(
      holdings
        .filter(h => !h.is_manual && (h.type === 'Stock' || h.type === 'ETF'))
        .map(h => h.ticker)
    )],
    [holdings]
  );
  const [selectedTicker, setSelectedTicker] = useState('');

  const handleTickerSelect = (ticker) => {
    setSelectedTicker(ticker);
    const holding = holdings.find(h => h.ticker === ticker);
    if (holding?.current_price) {
      const p = holding.current_price;
      setStockPrice(parseFloat(p.toFixed(2)));
      setStrike(Math.round(p * 1.03));
      setStrike2(Math.round(p * 1.10));
    }
  };

  const strategy = STRATEGIES[selectedStrategy];

  // Memoized payoff data
  const payoffData = useMemo(() =>
    generatePayoffData(selectedStrategy, { stockPrice, strike, strike2, premium, premium2 }),
    [selectedStrategy, stockPrice, strike, strike2, premium, premium2]
  );

  // Memoized Greeks
  const T = daysToExp / 365;
  const sigma = iv / 100;
  const optType = selectedStrategy.includes('put') ? 'put' : 'call';

  const greeks = useMemo(() => ({
    delta: calcDelta(stockPrice, strike, T, riskFreeRate, sigma, optType),
    gamma: calcGamma(stockPrice, strike, T, riskFreeRate, sigma),
    theta: calcTheta(stockPrice, strike, T, riskFreeRate, sigma, optType),
    vega: calcVega(stockPrice, strike, T, riskFreeRate, sigma),
  }), [stockPrice, strike, T, riskFreeRate, sigma, optType]);

  // Derived stats
  const maxPnl = useMemo(() => Math.max(...payoffData.map(d => d.pnl)), [payoffData]);
  const minPnl = useMemo(() => Math.min(...payoffData.map(d => d.pnl)), [payoffData]);
  const breakevens = useMemo(() => {
    const bPoints = [];
    for (let i = 1; i < payoffData.length; i++) {
      const prev = payoffData[i - 1];
      const curr = payoffData[i];
      if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl >= 0 && curr.pnl < 0)) {
        const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
        bPoints.push(parseFloat((prev.price + ratio * (curr.price - prev.price)).toFixed(2)));
      }
    }
    return bPoints;
  }, [payoffData]);

  const costToEnter = useMemo(() => {
    if (strategy.needsStrike2) return parseFloat(((premium + premium2) * 100).toFixed(0));
    return parseFloat((premium * 100).toFixed(0));
  }, [strategy.needsStrike2, premium, premium2]);

  // Filtered strategies
  const filteredStrategies = useMemo(() =>
    Object.entries(STRATEGIES).filter(([, s]) =>
      categoryFilter === 'all' || s.category === categoryFilter
    ),
    [categoryFilter]
  );

  const labelSt = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted, fontFamily: SANS };
  const numSt = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 1. Ticker Quick-Select ──────────────────────────── */}
      {tickers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {tickers.map((t, i) => {
            const isActive = selectedTicker === t;
            return (
              <button
                key={t}
                onClick={() => handleTickerSelect(t)}
                style={{
                  padding: '10px 14px', borderRadius: 8, minHeight: 44,
                  border: `1px solid ${isActive ? C.accent : C.border}`,
                  background: isActive ? C.accent + '22' : C.card,
                  color: isActive ? C.accent : C.textMuted,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO,
                  transition: 'border-color 0.2s ease, background-color 0.2s ease',
                  animation: 'fadeSlideUp 0.35s ease-out both',
                  animationDelay: `${i * 0.07}s`,
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}

      {/* ── 2. Category Filter + Strategy Cards ────────────── */}
      <div>
        <div style={{
          display: 'inline-flex', background: C.bg, borderRadius: 8,
          padding: 3, border: `1px solid ${C.border}`, marginBottom: 12,
        }}>
          {['all', 'basic', 'intermediate'].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                padding: '8px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, minHeight: 36, fontFamily: SANS,
                background: categoryFilter === cat ? C.accent + '22' : 'transparent',
                color: categoryFilter === cat ? C.accent : C.textMuted,
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filteredStrategies.map(([key, s], i) => {
            const isSelected = selectedStrategy === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedStrategy(key)}
                style={{
                  textAlign: 'left', borderRadius: 12, padding: 16, cursor: 'pointer',
                  border: `1px solid ${isSelected ? C.accent : C.border}`,
                  background: isSelected ? C.accent + '12' : C.card,
                  transition: 'border-color 0.2s ease, background-color 0.2s ease',
                  animation: 'fadeSlideUp 0.35s ease-out both',
                  animationDelay: `${i * 0.07}s`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isSelected ? C.accent : C.text }}>{s.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: s.dirColor + '22', color: s.dirColor,
                  }}>
                    {s.direction}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{s.description}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.textDim }}>
                    {s.legs} leg{s.legs > 1 ? 's' : ''}
                  </span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                    background: s.riskColor + '22', color: s.riskColor,
                  }}>
                    {s.riskLevel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. Parameter Sliders ───────────────────────────── */}
      <div style={{ ...cardStyle }}>
        <div style={{ ...labelSt, marginBottom: 16 }}>Simulation Parameters</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <SliderParam label="Stock Price" value={stockPrice} min={10} max={500} step={0.5} format={v => `$${v.toFixed(2)}`} onChange={setStockPrice} />
          <SliderParam label="Strike Price" value={strike} min={10} max={500} step={1} format={v => `$${v.toFixed(0)}`} onChange={setStrike} />
          {strategy.needsStrike2 && (
            <SliderParam label="Strike 2" value={strike2} min={10} max={500} step={1} format={v => `$${v.toFixed(0)}`} onChange={setStrike2} />
          )}
          <SliderParam label="Premium" value={premium} min={0.1} max={50} step={0.1} format={v => `$${v.toFixed(2)}`} onChange={setPremium} />
          {strategy.needsStrike2 && (
            <SliderParam label="Premium 2" value={premium2} min={0.1} max={50} step={0.1} format={v => `$${v.toFixed(2)}`} onChange={setPremium2} />
          )}
          <SliderParam label="Days to Expiration" value={daysToExp} min={1} max={365} step={1} format={v => `${v}d`} onChange={setDaysToExp} />
          <SliderParam label="Implied Volatility" value={iv} min={5} max={100} step={1} format={v => `${v}%`} onChange={setIV} />
        </div>
      </div>

      {/* ── 4. P&L Payoff Diagram ──────────────────────────── */}
      <div style={{ ...cardStyle }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{strategy.name} P&L at Expiration</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {selectedTicker ? `${selectedTicker} ` : ''}Stock: ${stockPrice.toFixed(2)} | Strike: ${strike}{strategy.needsStrike2 ? ` / $${strike2}` : ''} | Premium: ${premium.toFixed(2)}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={payoffData} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.green} stopOpacity={0.35} />
                <stop offset="100%" stopColor={C.green} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gradNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.red} stopOpacity={0.05} />
                <stop offset="100%" stopColor={C.red} stopOpacity={0.35} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={C.chartGrid} strokeDasharray="4 4" />
            <XAxis
              dataKey="price"
              tick={{ fill: C.textDim, fontSize: 12, fontFamily: `${SANS}` }}
              tickLine={false} axisLine={false}
              tickFormatter={v => `$${v.toFixed(0)}`}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: C.textDim, fontSize: 11, fontFamily: MONO }}
              tickLine={false} axisLine={false}
              tickFormatter={v => `$${v.toFixed(0)}`}
              width={56}
            />
            <Tooltip content={<PayoffTooltip />} cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} />
            <ReferenceLine y={0} stroke={C.chartCrosshair} strokeDasharray="6 3" />
            <ReferenceLine
              x={stockPrice}
              stroke={C.accent}
              strokeDasharray="4 4"
              label={{ value: 'Current', fill: C.accent, fontSize: 11, position: 'top' }}
            />
            {breakevens.map((be, i) => (
              <ReferenceLine
                key={`be-${i}`}
                x={be}
                stroke={C.amber}
                strokeDasharray="4 4"
                label={{ value: 'B/E', fill: C.amber, fontSize: 11, position: 'top' }}
              />
            ))}
            <Area type="monotone" dataKey="pnlPos" stroke={C.green} strokeWidth={2} fill="url(#gradPos)" dot={false} activeDot={false} />
            <Area type="monotone" dataKey="pnlNeg" stroke={C.red} strokeWidth={2} fill="url(#gradNeg)" dot={false} activeDot={false} />
          </AreaChart>
        </ResponsiveContainer>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div>
            <div style={labelSt}>Max Profit</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.green, marginTop: 2, ...numSt }}>
              {maxPnl >= 10000 ? 'Unlimited' : `+$${maxPnl.toFixed(0)}`}
            </div>
          </div>
          <div>
            <div style={labelSt}>Max Loss</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.red, marginTop: 2, ...numSt }}>
              -${Math.abs(minPnl).toFixed(0)}
            </div>
          </div>
          <div>
            <div style={labelSt}>Breakeven</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.amber, marginTop: 2, ...numSt }}>
              {breakevens.length > 0 ? breakevens.map(b => `$${b.toFixed(2)}`).join(' / ') : 'N/A'}
            </div>
          </div>
          <div>
            <div style={labelSt}>Cost to Enter</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2, ...numSt }}>
              ${costToEnter}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Greeks Dashboard ────────────────────────────── */}
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            padding: '10px 20px', borderRadius: 20, minHeight: 44,
            border: `1px solid ${C.border}`, background: showAdvanced ? C.accent + '22' : C.card,
            color: showAdvanced ? C.accent : C.textMuted,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
            transition: 'border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease',
          }}
        >
          {showAdvanced ? 'Hide Greeks' : 'Show Greeks'}
        </button>
      </div>

      {showAdvanced && (
        <div style={{ ...cardStyle, animation: 'fadeSlideUp 0.35s ease-out both' }}>
          <div style={{ ...labelSt, marginBottom: 16 }}>Option Greeks</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}>
            {Object.entries(GREEK_TOOLTIPS).map(([key, tip]) => {
              const val = greeks[key];
              const isExpanded = expandedGreek === key;
              return (
                <button
                  key={key}
                  onClick={() => setExpandedGreek(isExpanded ? null : key)}
                  style={{
                    textAlign: 'left', borderRadius: 12, padding: 14, cursor: 'pointer',
                    border: `1px solid ${isExpanded ? tip.color + '66' : C.border}`,
                    background: isExpanded ? tip.color + '12' : C.elevated,
                    transition: 'border-color 0.2s ease, background-color 0.2s ease',
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 700, color: tip.color, lineHeight: 1 }}>{tip.symbol}</div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: C.textMuted, fontWeight: 600, marginTop: 4, letterSpacing: '0.06em' }}>
                    {key}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginTop: 6, ...numSt }}>
                    {val.toFixed(4)}
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, lineHeight: 1.4 }}>
                    {tip.short}
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6, marginBottom: 6 }}>{tip.long}</div>
                      <div style={{ fontSize: 10, color: C.textDim }}>{tip.range}</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 6. Strategy Explainer ──────────────────────────── */}
      <div style={{ ...cardStyle, animation: 'fadeSlideUp 0.35s ease-out both' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{strategy.name}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
            background: strategy.dirColor + '22', color: strategy.dirColor,
          }}>
            {strategy.direction}
          </span>
        </div>

        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
          <span style={{ fontWeight: 700, color: C.text }}>Best when: </span>
          {strategy.bestWhen}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: 12, background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.green, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Max Profit</div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{strategy.maxProfit}</div>
          </div>
          <div style={{ padding: 12, background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.red, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Max Loss</div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{strategy.maxLoss}</div>
          </div>
          <div style={{ padding: 12, background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Breakeven</div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{strategy.breakeven}</div>
          </div>
          <div style={{ padding: 12, background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.accent, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Risk Level</div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{strategy.riskLevel} ({strategy.legs} leg{strategy.legs > 1 ? 's' : ''})</div>
          </div>
        </div>
      </div>

      {/* ── 7. Disclaimer ──────────────────────────────────── */}
      <div style={{
        fontSize: 11, color: C.textDim, textAlign: 'center', marginTop: 8,
        paddingTop: 16, borderTop: `1px solid ${C.border}`,
      }}>
        Options involve risk and are not suitable for all investors. This is a simulator for educational purposes only — not financial advice.
      </div>
    </div>
  );
}

/* ── Slider sub-component ─────────────────────────────────────── */

function SliderParam({ label, value, min, max, step, format, onChange }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted, fontFamily: SANS }}>
          {label}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        className="options-slider"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 10, color: C.textDim }}>{format(min)}</span>
        <span style={{ fontSize: 10, color: C.textDim }}>{format(max)}</span>
      </div>
    </div>
  );
}
