import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';

const StatCard = ({ label, value, sub, color }) => (
  <div style={{
    padding: '12px 14px', background: C.bg, borderRadius: 10,
    border: `1px solid ${C.border}`,
  }}>
    <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: color || C.text, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
  </div>
);

const fmtMktCap = (v) => {
  if (!v) return 'N/A';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

const fmtPct = (v) => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : 'N/A';

const PERIODS = [
  { id: '1m', label: '1M' },
  { id: '3m', label: '3M' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
];

function PriceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '8px 12px', fontSize: 11,
    }}>
      <div style={{ color: C.textMuted, marginBottom: 4 }}>{d.date}</div>
      <div style={{ color: C.text, fontWeight: 700, fontFamily: MONO }}>${d.close?.toFixed(2)}</div>
      {d.volume != null && (
        <div style={{ color: C.textDim, fontSize: 10, marginTop: 2 }}>
          Vol: {(d.volume / 1e6).toFixed(1)}M
        </div>
      )}
    </div>
  );
}

export default function StockDeepDive({ holdingDetail, portfolioBeta, totalValue, onBack }) {
  const [technicals, setTechnicals] = useState(null);
  const [priceHistory, setPriceHistory] = useState(null);
  const [period, setPeriod] = useState('3m');
  const [loadingTech, setLoadingTech] = useState(true);
  const [loadingPrice, setLoadingPrice] = useState(true);

  const ticker = holdingDetail?.ticker;

  useEffect(() => {
    if (!ticker) return;
    setLoadingTech(true);
    api.getTechnicals(ticker).then(setTechnicals).catch(() => setTechnicals(null)).finally(() => setLoadingTech(false));
  }, [ticker]);

  useEffect(() => {
    if (!ticker) return;
    setLoadingPrice(true);
    api.getPriceHistory(ticker, period).then(setPriceHistory).catch(() => setPriceHistory(null)).finally(() => setLoadingPrice(false));
  }, [ticker, period]);

  if (!holdingDetail) return null;

  const h = holdingDetail;
  const chartData = priceHistory || [];

  // Risk impact: portfolio beta without this holding
  const hBeta = h.beta;
  const hValue = h.market_value;
  const remainingValue = totalValue - hValue;
  let betaWithout = null;
  if (portfolioBeta != null && hBeta != null && remainingValue > 0) {
    betaWithout = (portfolioBeta * totalValue - hBeta * hValue) / remainingValue;
  }
  const betaDelta = portfolioBeta != null && betaWithout != null ? betaWithout - portfolioBeta : null;

  return (
    <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Stock header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: MONO, color: C.accent }}>{h.ticker}</h3>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.text }}>
          ${h.current_price?.toFixed(2)}
        </span>
        <span style={{ fontSize: 12, color: h.gain_loss_pct >= 0 ? C.green : C.red, fontFamily: MONO }}>
          {h.gain_loss_pct >= 0 ? '+' : ''}{h.gain_loss_pct.toFixed(1)}%
        </span>
        {h.industry && <span style={{ fontSize: 11, color: C.textDim }}>{h.industry}</span>}
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
        <StatCard label="P/E Ratio" value={h.trailing_pe?.toFixed(1) || 'N/A'} sub={h.forward_pe ? `Fwd: ${h.forward_pe.toFixed(1)}` : null} />
        <StatCard label="Beta" value={h.beta?.toFixed(2) || 'N/A'} color={h.beta && h.beta > 1.2 ? C.amber : C.text} />
        <StatCard label="Earnings Growth" value={fmtPct(h.earnings_growth)} color={h.earnings_growth > 0 ? C.green : h.earnings_growth < 0 ? C.red : C.text} />
        <StatCard label="Revenue Growth" value={fmtPct(h.revenue_growth)} color={h.revenue_growth > 0 ? C.green : h.revenue_growth < 0 ? C.red : C.text} />
        <StatCard label="Dividend Yield" value={h.dividend_yield != null ? `${h.dividend_yield.toFixed(2)}%` : 'N/A'} color={C.cyan} />
        <StatCard label="Market Cap" value={fmtMktCap(h.market_cap)} />
      </div>

      {/* Price chart */}
      <div style={{
        background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`,
        padding: '16px 16px 8px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>Price History</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{
                  padding: '8px 10px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, minHeight: 44,
                  cursor: 'pointer',
                  background: period === p.id ? C.accent : 'transparent',
                  color: period === p.id ? '#fff' : C.textDim,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {loadingPrice ? (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 12 }}>
            Loading chart...
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id={`stockGrad_${ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke={C.chartGrid} vertical={false} />
              <XAxis
                dataKey="date" tick={{ fill: C.textDim, fontSize: 9 }}
                axisLine={{ stroke: C.border }} tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: C.textDim, fontSize: 9, fontFamily: MONO }}
                axisLine={false} tickLine={false}
                domain={['auto', 'auto']}
                tickFormatter={v => `$${v.toFixed(0)}`}
                width={48}
              />
              <Tooltip content={<PriceTooltip />} cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} />
              <Area
                type="monotone" dataKey="close"
                stroke={C.accent} strokeWidth={2}
                fill={`url(#stockGrad_${ticker})`}
                dot={false} animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 12 }}>
            No price data available
          </div>
        )}
      </div>

      {/* Technical indicators */}
      {!loadingTech && technicals && (
        <div style={{
          background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`,
          padding: 16, marginBottom: 20,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 12 }}>Technical Indicators</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase' }}>RSI (14)</div>
              <div style={{
                fontSize: 16, fontWeight: 700, fontFamily: MONO, marginTop: 2,
                color: technicals.rsi >= 70 ? C.red : technicals.rsi <= 30 ? C.green : C.text,
              }}>
                {technicals.rsi?.toFixed(1) || 'N/A'}
              </div>
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>
                {technicals.rsi >= 70 ? 'Overbought' : technicals.rsi <= 30 ? 'Oversold' : 'Neutral'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase' }}>SMA 20</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: C.text, marginTop: 2 }}>
                ${technicals.sma20?.toFixed(2) || 'N/A'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase' }}>SMA 50</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: C.text, marginTop: 2 }}>
                ${technicals.sma50?.toFixed(2) || 'N/A'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase' }}>SMA 200</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: C.text, marginTop: 2 }}>
                ${technicals.sma200?.toFixed(2) || 'N/A'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase' }}>Trend</div>
              <div style={{
                fontSize: 14, fontWeight: 700, marginTop: 2,
                color: technicals.trend?.includes('Bullish') ? C.green : technicals.trend?.includes('Bearish') ? C.red : C.amber,
              }}>
                {technicals.trend || 'N/A'}
              </div>
            </div>
          </div>
          {technicals.alerts?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 12 }}>
              {technicals.alerts.map((a, i) => (
                <span key={i} style={{
                  fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: C.amber + '22', color: C.amber, border: `1px solid ${C.amber}44`,
                }}>
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Position sizing */}
      <div style={{
        background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`,
        padding: 16, marginBottom: 20,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 12 }}>Position Sizing</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <StatCard label="Shares" value={h.shares} />
          <StatCard label="Avg Cost" value={`$${h.avg_cost?.toFixed(2)}`} />
          <StatCard label="Market Value" value={`$${h.market_value?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <StatCard label="Cost Basis" value={`$${h.cost_basis?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
          <StatCard
            label="Weight"
            value={`${h.weight?.toFixed(1)}%`}
            sub={`of $${totalValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })} portfolio`}
          />
          <StatCard
            label="Return Contrib"
            value={`${h.return_contribution >= 0 ? '+' : ''}${h.return_contribution?.toFixed(3)}%`}
            color={h.return_contribution >= 0 ? C.green : C.red}
          />
        </div>
      </div>

      {/* Risk impact panel */}
      <div style={{
        background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`,
        padding: 16,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: 12 }}>
          Risk Impact — What If Removed?
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Beta impact */}
          <div style={{ padding: '12px 16px', background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', marginBottom: 6 }}>Portfolio Beta Impact</div>
            {portfolioBeta != null && betaWithout != null ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.text }}>
                    {portfolioBeta.toFixed(3)}
                  </span>
                  <span style={{ fontSize: 14, color: C.textDim }}>→</span>
                  <span style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.text }}>
                    {betaWithout.toFixed(3)}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, fontFamily: MONO,
                    color: betaDelta < 0 ? C.green : betaDelta > 0 ? C.red : C.textMuted,
                  }}>
                    ({betaDelta >= 0 ? '+' : ''}{betaDelta.toFixed(3)})
                  </span>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
                  {betaDelta < 0
                    ? `Removing ${ticker} would lower portfolio risk`
                    : betaDelta > 0
                    ? `Removing ${ticker} would increase portfolio risk`
                    : `Removing ${ticker} would not change portfolio risk`
                  }
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.textDim }}>Beta data not available for this holding</div>
            )}
          </div>

          {/* Return contribution impact */}
          <div style={{ padding: '12px 16px', background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', marginBottom: 6 }}>Return Contribution</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontSize: 18, fontWeight: 700, fontFamily: MONO,
                color: h.return_contribution >= 0 ? C.green : C.red,
              }}>
                {h.return_contribution >= 0 ? '+' : ''}{h.return_contribution?.toFixed(3)}%
              </span>
            </div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
              This position {h.return_contribution >= 0 ? 'adds' : 'drags'} {Math.abs(h.return_contribution).toFixed(3)}% to total portfolio return
            </div>
          </div>

          {/* Weight significance */}
          <div style={{ padding: '12px 16px', background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', marginBottom: 6 }}>Position Significance</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.text }}>
                {h.weight?.toFixed(1)}%
              </span>
              <span style={{ fontSize: 11, color: C.textDim }}>of portfolio</span>
            </div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
              {h.weight > 10
                ? 'Significant position — high impact on portfolio performance'
                : h.weight > 5
                ? 'Moderate position — meaningful contribution'
                : 'Small position — limited portfolio impact'
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
