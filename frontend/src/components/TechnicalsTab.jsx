import { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO, SANS, TICKER_COLORS } from '../styles/theme';
import { cardStyle } from '../styles/shared';
import { SkeletonChart, SkeletonCard } from './SkeletonLoader';

/* ══════════════════════════════════════════════════════════════════════
   HELPER UTILITIES
   ══════════════════════════════════════════════════════════════════════ */

const labelSt = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.textMuted, fontFamily: SANS };
const numSt = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' };

/* ── Technical Health Score (0–100) ── */
function computeHealthScore(data) {
  if (!data) return null;
  let score = 50; // neutral baseline

  // RSI contribution (±15)
  if (data.rsi != null) {
    if (data.rsi >= 40 && data.rsi <= 60) score += 10; // neutral is healthy
    else if (data.rsi >= 30 && data.rsi <= 70) score += 5;
    else if (data.rsi < 30) score += 15; // oversold = buying opportunity
    else if (data.rsi > 70) score -= 10; // overbought risk
    if (data.rsi > 80) score -= 5;
  }

  // Trend contribution (±20)
  if (data.trend) {
    if (data.trend === 'Bullish') score += 20;
    else if (data.trend === 'Bullish (LT)') score += 12;
    else if (data.trend === 'Bearish') score -= 15;
  }

  // SMA alignment (±10)
  if (data.sma50 && data.sma200) {
    if (data.sma50 > data.sma200) score += 10; // golden cross territory
    else score -= 8;
  }

  // Price vs SMA50 (±5)
  if (data.price && data.sma50) {
    if (data.price > data.sma50) score += 5;
    else score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

function healthLabel(score) {
  if (score >= 75) return { text: 'Strong Buy', color: C.green };
  if (score >= 60) return { text: 'Buy', color: '#4ADE80' };
  if (score >= 45) return { text: 'Hold', color: C.amber };
  if (score >= 30) return { text: 'Caution', color: '#F97316' };
  return { text: 'Sell Signal', color: C.red };
}

function rsiZone(rsi) {
  if (rsi >= 80) return { label: 'Strongly Overbought', color: C.red, tip: 'High chance of pullback. Consider taking profits or tightening stops.' };
  if (rsi >= 70) return { label: 'Overbought', color: '#F97316', tip: 'Momentum is stretched. Watch for reversal signals before acting.' };
  if (rsi >= 60) return { label: 'Bullish', color: C.green, tip: 'Healthy upward momentum. Trend is in your favor.' };
  if (rsi >= 40) return { label: 'Neutral', color: C.amber, tip: 'No strong momentum either way. Wait for a clearer signal.' };
  if (rsi >= 30) return { label: 'Bearish', color: '#F97316', tip: 'Momentum weakening. Could be a dip-buy or start of a downtrend.' };
  if (rsi >= 20) return { label: 'Oversold', color: C.green, tip: 'Potential bounce opportunity. Look for reversal confirmation.' };
  return { label: 'Deeply Oversold', color: C.green, tip: 'Extreme selling pressure. Strong reversal potential if fundamentals are intact.' };
}

const fmtDate = (str) => {
  if (!str) return '';
  const d = new Date(str);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtVol = (v) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
};

const periodMap = { '1W': '1w', '1M': '1m', '3M': '3m', '6M': '6m', '1Y': '1y', '2Y': '2y' };
const PERIODS = Object.keys(periodMap);

/* ══════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════════════════════════════ */

/* ── Health Score Gauge ── */
const HealthGauge = ({ score, size = 120 }) => {
  if (score == null) return null;
  const { text, color } = healthLabel(score);
  const circumference = Math.PI * (size - 12);
  const progress = (score / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path
          d={`M 6 ${size / 2 + 4} A ${size / 2 - 6} ${size / 2 - 6} 0 0 1 ${size - 6} ${size / 2 + 4}`}
          fill="none" stroke={C.border} strokeWidth={8} strokeLinecap="round"
        />
        <path
          d={`M 6 ${size / 2 + 4} A ${size / 2 - 6} ${size / 2 - 6} 0 0 1 ${size - 6} ${size / 2 + 4}`}
          fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.8s ease-out, stroke 0.3s' }}
        />
        <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fill={C.text} fontSize={28} fontWeight={700} fontFamily={MONO}>
          {score}
        </text>
      </svg>
      <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: '0.03em' }}>{text}</span>
    </div>
  );
};

/* ── RSI Gauge (semicircular) ── */
const RSIGauge = ({ rsi }) => {
  if (rsi == null) return null;
  const zone = rsiZone(rsi);
  const size = 100;
  const circumference = Math.PI * (size - 10);
  const progress = (rsi / 100) * circumference;

  // Color gradient based on zones
  const rsiColor = rsi > 70 ? C.red : rsi > 60 ? '#4ADE80' : rsi > 40 ? C.amber : rsi > 30 ? '#F97316' : C.green;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        <path
          d={`M 5 ${size / 2 + 3} A ${size / 2 - 5} ${size / 2 - 5} 0 0 1 ${size - 5} ${size / 2 + 3}`}
          fill="none" stroke={C.border} strokeWidth={6} strokeLinecap="round"
        />
        <path
          d={`M 5 ${size / 2 + 3} A ${size / 2 - 5} ${size / 2 - 5} 0 0 1 ${size - 5} ${size / 2 + 3}`}
          fill="none" stroke={rsiColor} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.6s ease-out' }}
        />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fill={C.text} fontSize={22} fontWeight={700} fontFamily={MONO}>
          {rsi.toFixed(0)}
        </text>
      </svg>
      <span style={{ fontSize: 10, fontWeight: 700, color: zone.color }}>{zone.label}</span>
    </div>
  );
};

/* ── Price Level Ladder ── */
const PriceLadder = ({ price, support, resistance, sma50, sma200 }) => {
  const levels = [];
  if (resistance?.[1]) levels.push({ label: 'R2', value: resistance[1], color: C.red });
  if (resistance?.[0]) levels.push({ label: 'R1', value: resistance[0], color: C.red });
  if (sma200) levels.push({ label: '200 SMA', value: sma200, color: C.purple });
  if (sma50) levels.push({ label: '50 SMA', value: sma50, color: C.blue });
  if (support?.[0]) levels.push({ label: 'S1', value: support[0], color: C.green });
  if (support?.[1]) levels.push({ label: 'S2', value: support[1], color: C.green });

  // Sort descending by value
  levels.sort((a, b) => b.value - a.value);

  if (levels.length === 0) return null;

  const maxVal = Math.max(price, ...levels.map(l => l.value));
  const minVal = Math.min(price, ...levels.map(l => l.value));
  const range = maxVal - minVal || 1;

  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ ...labelSt, marginBottom: 12 }}>Price Levels</div>
      <div style={{ position: 'relative', height: levels.length * 36 + 20, marginLeft: 60, marginRight: 16 }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
          background: `linear-gradient(to bottom, ${C.red}44, ${C.amber}44, ${C.green}44)`,
          borderRadius: 1,
        }} />

        {levels.map((level, i) => {
          const isAbovePrice = level.value > price;
          const distPct = ((level.value - price) / price * 100);
          return (
            <div key={`${level.label}-${i}`} style={{
              position: 'relative',
              padding: '6px 0 6px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              {/* Dot on the line */}
              <div style={{
                position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)',
                width: 10, height: 10, borderRadius: '50%',
                background: level.color, border: `2px solid ${C.card}`,
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: level.color, minWidth: 48 }}>{level.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text, ...numSt }}>${level.value.toFixed(2)}</span>
              </div>
              <span style={{ fontSize: 10, color: isAbovePrice ? C.red : C.green, ...numSt }}>
                {distPct >= 0 ? '+' : ''}{distPct.toFixed(1)}%
              </span>
            </div>
          );
        })}

        {/* Current price marker */}
        <div style={{
          position: 'absolute', left: -60, right: -16,
          top: `${((maxVal - price) / range) * 100}%`,
          transform: 'translateY(-50%)',
          height: 2, background: C.accent + '44',
          display: 'flex', alignItems: 'center',
        }}>
          <div style={{
            position: 'absolute', left: 0,
            background: C.accent, color: '#fff', fontSize: 10, fontWeight: 700,
            padding: '2px 6px', borderRadius: 4, ...numSt, whiteSpace: 'nowrap',
          }}>
            ${price.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Signal Card with educational tip ── */
const SignalCard = ({ icon, title, value, valueColor, status, statusColor, tip, expanded, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      ...cardStyle, padding: 14, cursor: 'pointer', textAlign: 'left', width: '100%',
      border: `1px solid ${expanded ? statusColor + '44' : C.border}`,
      background: expanded ? statusColor + '08' : C.card,
      transition: 'border-color 0.2s, background 0.2s',
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: valueColor || C.text, marginTop: 2, ...numSt }}>{value}</div>
        </div>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
        background: statusColor + '22', color: statusColor,
      }}>
        {status}
      </span>
    </div>
    {expanded && tip && (
      <div style={{
        marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`,
        fontSize: 12, color: C.textMuted, lineHeight: 1.6,
        animation: 'fadeSlideUp 0.25s ease-out',
      }}>
        <span style={{ fontWeight: 700, color: C.text }}>What this means: </span>{tip}
      </div>
    )}
  </button>
);

/* ── Period Selector ── */
const PeriodSelector = ({ period, onPeriodChange }) => (
  <div style={{
    display: 'inline-flex', background: C.bg, borderRadius: 8,
    padding: 2, border: `1px solid ${C.border}`,
  }}>
    {PERIODS.map(p => (
      <button
        key={p}
        onClick={() => onPeriodChange(p)}
        style={{
          padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 700, fontFamily: MONO, minHeight: 32,
          background: period === p ? C.accent + '22' : 'transparent',
          color: period === p ? C.accent : C.textMuted,
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {p}
      </button>
    ))}
  </div>
);

/* ── Custom Chart Tooltip ── */
const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>{fmtDate(d.date)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px', fontSize: 12 }}>
        {d.open != null && <><span style={{ color: C.textMuted }}>O</span><span style={{ color: C.text, ...numSt }}>${d.open.toFixed(2)}</span></>}
        {d.high != null && <><span style={{ color: C.textMuted }}>H</span><span style={{ color: C.green, ...numSt }}>${d.high.toFixed(2)}</span></>}
        {d.low != null && <><span style={{ color: C.textMuted }}>L</span><span style={{ color: C.red, ...numSt }}>${d.low.toFixed(2)}</span></>}
        {d.close != null && <><span style={{ color: C.textMuted }}>C</span><span style={{ fontWeight: 700, color: C.text, ...numSt }}>${d.close.toFixed(2)}</span></>}
        {d.volume != null && <><span style={{ color: C.textMuted }}>Vol</span><span style={{ color: C.textMuted, ...numSt }}>{fmtVol(d.volume)}</span></>}
      </div>
    </div>
  );
};

/* ── Price Chart with S/R + SMA overlays ── */
const PriceChart = ({ data, support, resistance, sma50, sma200, period, onPeriodChange, isLoading }) => {
  if (isLoading) return <SkeletonChart height={360} />;
  if (!data || data.length === 0) return (
    <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: C.textDim }}>
      No price data available for this period.
    </div>
  );

  const supportLabels = ['S1', 'S2', 'S3'];
  const resistLabels = ['R1', 'R2', 'R3'];

  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={labelSt}>Price Chart</div>
        <PeriodSelector period={period} onPeriodChange={onPeriodChange} />
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={data} margin={{ top: 8, right: 52, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="techPriceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity={0.25} />
              <stop offset="100%" stopColor={C.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.chartGrid} strokeDasharray="4 4" />
          <XAxis
            dataKey="date" tick={{ fill: C.textDim, fontSize: 10, fontFamily: SANS }}
            tickLine={false} axisLine={false} tickFormatter={fmtDate}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }}
            tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(0)}`}
            width={48}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} />

          {/* Support levels (S1, S2, S3) */}
          {support?.map((level, i) => level && (
            <ReferenceLine key={`s${i}`} y={level} stroke={C.green} strokeDasharray={i === 0 ? '6 3' : '4 4'} strokeOpacity={i === 0 ? 0.6 : 0.35}
              label={{ value: `${supportLabels[i]}`, fill: C.green, fontSize: 9, position: 'right' }} />
          ))}

          {/* Resistance levels (R1, R2, R3) */}
          {resistance?.map((level, i) => level && (
            <ReferenceLine key={`r${i}`} y={level} stroke={C.red} strokeDasharray={i === 0 ? '6 3' : '4 4'} strokeOpacity={i === 0 ? 0.6 : 0.35}
              label={{ value: `${resistLabels[i]}`, fill: C.red, fontSize: 9, position: 'right' }} />
          ))}

          {/* SMA overlays */}
          {sma50 && <ReferenceLine y={sma50} stroke="#5B9BD5" strokeDasharray="8 4" strokeOpacity={0.5}
            label={{ value: '50', fill: '#5B9BD5', fontSize: 9, position: 'right' }} />}
          {sma200 && <ReferenceLine y={sma200} stroke="#C77DFF" strokeDasharray="8 4" strokeOpacity={0.5}
            label={{ value: '200', fill: '#C77DFF', fontSize: 9, position: 'right' }} />}

          <Area
            type="monotone" dataKey="close" stroke={C.accent} strokeWidth={2}
            fill="url(#techPriceGrad)" dot={false} activeDot={{ r: 4, fill: C.accent }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ── News Feed ── */
const NewsFeed = ({ articles, ticker, loading }) => {
  if (loading) return <SkeletonCard height={200} />;
  if (!articles || articles.length === 0) return (
    <div style={{ ...cardStyle, padding: 32, textAlign: 'center', color: C.textDim, fontSize: 13 }}>
      No recent news for {ticker}.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {articles.slice(0, 8).map((article, i) => (
        <a
          key={i}
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...cardStyle, padding: 14, textDecoration: 'none', display: 'block',
            transition: 'border-color 0.15s',
            animation: 'fadeSlideUp 0.3s ease-out both',
            animationDelay: `${i * 0.05}s`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.5, marginBottom: 4 }}>
            {article.title}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 10, color: C.textDim }}>
            {article.publisher && <span>{article.publisher}</span>}
            {article.providerPublishTime && (
              <span>{new Date(article.providerPublishTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            )}
          </div>
        </a>
      ))}
    </div>
  );
};

/* ── Fundamentals Panel ── */
const FundamentalsPanel = ({ data, loading }) => {
  if (loading) return <SkeletonCard height={120} />;
  if (!data) return null;

  const metrics = [
    { label: 'P/E Ratio', value: data.pe_ratio, format: v => v?.toFixed(1) || '—' },
    { label: 'Market Cap', value: data.market_cap, format: v => v ? (v >= 1e12 ? `$${(v/1e12).toFixed(1)}T` : v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : `$${(v/1e6).toFixed(0)}M`) : '—' },
    { label: 'Div Yield', value: data.dividend_yield, format: v => v ? `${(v * 100).toFixed(2)}%` : '—' },
    { label: '52w High', value: data.fifty_two_week_high, format: v => v ? `$${v.toFixed(2)}` : '—' },
    { label: '52w Low', value: data.fifty_two_week_low, format: v => v ? `$${v.toFixed(2)}` : '—' },
    { label: 'Beta', value: data.beta, format: v => v?.toFixed(2) || '—' },
  ].filter(m => m.value != null);

  if (metrics.length === 0) return null;

  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ ...labelSt, marginBottom: 12 }}>Fundamentals</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {metrics.map(m => (
          <div key={m.label}>
            <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 2, ...numSt }}>{m.format(m.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Position Card ── */
const PositionCard = ({ holding }) => {
  if (!holding) return null;
  const gl = holding.gain_loss || 0;
  const glPct = holding.gain_loss_pct || 0;
  const glColor = gl >= 0 ? C.green : C.red;

  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ ...labelSt, marginBottom: 12 }}>Your Position</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Shares</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, ...numSt }}>{holding.shares.toFixed(holding.shares % 1 ? 4 : 0)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Avg Cost</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, ...numSt }}>${holding.avg_cost.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Market Value</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, ...numSt }}>${holding.market_value.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', fontWeight: 600 }}>Gain / Loss</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: glColor, ...numSt }}>
            {gl >= 0 ? '+' : ''}${Math.abs(gl).toFixed(2)} ({glPct >= 0 ? '+' : ''}{glPct.toFixed(1)}%)
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Quick Scan Card (redesigned with health score) ── */
const QuickScanCard = ({ tech, isSelected, onClick, isLoading }) => {
  if (isLoading) return <SkeletonCard height={90} />;
  if (!tech) return null;

  const score = computeHealthScore(tech);
  const { text: signalText, color: signalColor } = score != null ? healthLabel(score) : { text: '—', color: C.textDim };
  const trendColor = tech.trend?.includes('Bull') ? C.green : tech.trend?.includes('Bear') ? C.red : C.amber;

  return (
    <button
      onClick={onClick}
      style={{
        ...cardStyle, padding: 12, cursor: 'pointer', textAlign: 'left', width: '100%',
        border: `1px solid ${isSelected ? C.accent : C.border}`,
        background: isSelected ? C.accent + '0C' : C.card,
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? C.accent : C.text, fontFamily: MONO }}>{tech.ticker}</span>
        {score != null && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: signalColor + '22', color: signalColor,
          }}>
            {score} {signalText}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text, ...numSt }}>${tech.price?.toFixed(2)}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {tech.rsi != null && (
            <span style={{ fontSize: 10, color: rsiZone(tech.rsi).color, ...numSt }}>RSI {tech.rsi.toFixed(0)}</span>
          )}
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: trendColor + '18', color: trendColor,
          }}>
            {tech.trend || '—'}
          </span>
        </div>
      </div>
      {tech.alerts?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {tech.alerts.map((a, i) => (
            <span key={i} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: C.amber + '22', color: C.amber, fontWeight: 600 }}>
              {a}
            </span>
          ))}
        </div>
      )}
    </button>
  );
};

/* ── Comparison Chart ── */
const ComparisonChart = ({ compareTickers, priceHistoryData, selectedPeriod, onPeriodChange, tickers, isLoading }) => {
  if (isLoading || compareTickers.length === 0) return <SkeletonChart height={400} />;

  const seriesMap = {};
  let commonDates = null;

  compareTickers.forEach(ticker => {
    const raw = priceHistoryData[`${ticker}-${selectedPeriod}`];
    if (!raw || raw.length === 0) return;
    const firstClose = raw[0].close;
    const dateMap = {};
    raw.forEach(d => { dateMap[d.date] = ((d.close - firstClose) / firstClose) * 100; });
    seriesMap[ticker] = dateMap;
    const dates = new Set(raw.map(d => d.date));
    commonDates = commonDates ? new Set([...commonDates].filter(d => dates.has(d))) : dates;
  });

  if (!commonDates || commonDates.size === 0) return (
    <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: C.textDim, fontSize: 12 }}>
      No overlapping price data for selected tickers.
    </div>
  );

  const chartData = [...commonDates].sort().map(date => {
    const point = { date };
    compareTickers.forEach(ticker => {
      if (seriesMap[ticker]) point[ticker] = seriesMap[ticker][date];
    });
    return point;
  });

  return (
    <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={labelSt}>Normalized % Change</div>
        <PeriodSelector period={selectedPeriod} onPeriodChange={onPeriodChange} />
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="4 4" stroke={C.chartGrid} strokeOpacity={0.4} />
          <XAxis dataKey="date" tick={{ fill: C.textDim, fontSize: 10 }} tickFormatter={fmtDate} interval="preserveStartEnd" />
          <YAxis tick={{ fill: C.textDim, fontSize: 10, fontFamily: MONO }} tickFormatter={v => `${v.toFixed(1)}%`} width={50} />
          <ReferenceLine y={0} stroke={C.textDim} strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                <div style={{ color: C.textDim, marginBottom: 4 }}>{fmtDate(label)}</div>
                {payload.map(p => (
                  <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
                    <span style={{ color: p.stroke, fontWeight: 700, fontFamily: MONO }}>{p.dataKey}</span>
                    <span style={{ color: p.value >= 0 ? C.green : C.red, fontFamily: MONO, fontWeight: 600 }}>
                      {p.value >= 0 ? '+' : ''}{p.value.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            );
          }} />
          {compareTickers.map(ticker => (
            <Line
              key={ticker}
              type="monotone"
              dataKey={ticker}
              stroke={TICKER_COLORS[tickers.indexOf(ticker) % TICKER_COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.textMuted, marginTop: 8, flexWrap: 'wrap' }}>
        {compareTickers.map(ticker => (
          <span key={ticker} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ display: 'inline-block', width: 14, height: 3, borderRadius: 2, background: TICKER_COLORS[tickers.indexOf(ticker) % TICKER_COLORS.length] }} />
            <span style={{ fontFamily: MONO, fontWeight: 700 }}>{ticker}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/* ── Comparison Table ── */
const ComparisonTable = ({ compareTickers, techData, tickers }) => {
  const metrics = [
    {
      label: 'Health',
      getValue: (t) => {
        const score = computeHealthScore(techData[t]);
        if (score == null) return { text: '—', color: C.textDim };
        const { color } = healthLabel(score);
        return { text: `${score}`, color };
      },
    },
    {
      label: 'RSI (14)',
      getValue: (t) => {
        const d = techData[t];
        if (!d?.rsi) return { text: '—', color: C.textDim };
        return { text: d.rsi.toFixed(0), color: rsiZone(d.rsi).color };
      },
    },
    {
      label: 'Trend',
      getValue: (t) => {
        const d = techData[t];
        if (!d?.trend) return { text: '—', color: C.textDim };
        const color = d.trend.includes('Bull') ? C.green : d.trend.includes('Bear') ? C.red : C.amber;
        return { text: d.trend, color };
      },
    },
    {
      label: 'vs 50d SMA',
      getValue: (t) => {
        const d = techData[t];
        if (!d?.price || !d?.sma50) return { text: '—', color: C.textDim };
        const pct = ((d.price - d.sma50) / d.sma50 * 100);
        return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, color: pct >= 0 ? C.green : C.red };
      },
    },
    {
      label: 'Volume vs Avg',
      getValue: (t) => {
        const d = techData[t];
        if (d?.volume_vs_avg == null) return { text: '—', color: C.textDim };
        const v = d.volume_vs_avg;
        const color = v > 20 ? C.green : v < -20 ? C.red : C.textMuted;
        return { text: `${v > 0 ? '+' : ''}${v}%`, color };
      },
    },
  ];

  return (
    <div style={{ ...cardStyle, padding: 16 }}>
      <div style={{ ...labelSt, marginBottom: 12 }}>Side-by-Side Comparison</div>
      <div data-no-swipe style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', minWidth: compareTickers.length * 100 + 100 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 9, color: C.textDim, fontWeight: 600, padding: '6px 8px', textTransform: 'uppercase' }}>Metric</th>
              {compareTickers.map(ticker => (
                <th key={ticker} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 12, fontWeight: 700, fontFamily: MONO }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: TICKER_COLORS[tickers.indexOf(ticker) % TICKER_COLORS.length] }} />
                    <span style={{ color: C.text }}>{ticker}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(metric => (
              <tr key={metric.label}>
                <td style={{ fontSize: 10, color: C.textMuted, fontWeight: 600, padding: '7px 8px', background: C.elevated, borderRadius: '6px 0 0 6px' }}>
                  {metric.label}
                </td>
                {compareTickers.map((ticker, i) => {
                  const val = metric.getValue(ticker);
                  return (
                    <td key={ticker} style={{
                      textAlign: 'right', padding: '7px 8px', background: C.elevated,
                      borderRadius: i === compareTickers.length - 1 ? '0 6px 6px 0' : 0,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: val.color }}>{val.text}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ── What To Do Card (decision helper) ── */
const ActionAdvice = ({ data }) => {
  if (!data) return null;
  const score = computeHealthScore(data);
  const { text: signal, color: signalColor } = score != null ? healthLabel(score) : { text: 'Hold', color: C.amber };

  const adviceItems = [];

  // RSI-based advice
  if (data.rsi != null) {
    if (data.rsi > 75) adviceItems.push({ text: 'RSI is overbought — consider taking partial profits or setting a trailing stop-loss.', type: 'caution' });
    else if (data.rsi < 30) adviceItems.push({ text: 'RSI is oversold — could be a buying opportunity if you believe in the fundamentals.', type: 'opportunity' });
    else if (data.rsi >= 50 && data.rsi <= 60) adviceItems.push({ text: 'RSI shows healthy momentum — the trend is in your favor.', type: 'positive' });
  }

  // Trend-based advice
  if (data.trend === 'Bullish') adviceItems.push({ text: 'Strong uptrend — moving averages are aligned bullishly. Good to hold or add on dips.', type: 'positive' });
  else if (data.trend === 'Bearish') adviceItems.push({ text: 'Downtrend in place — consider reducing exposure or waiting for trend reversal confirmation.', type: 'caution' });

  // Support/resistance
  if (data.support?.[0] && data.price) {
    const distToSupport = ((data.price - data.support[0]) / data.price * 100);
    if (distToSupport < 3) adviceItems.push({ text: `Price is near support at $${data.support[0].toFixed(2)} — watch for a bounce or break below.`, type: 'info' });
  }
  if (data.resistance?.[0] && data.price) {
    const distToResistance = ((data.resistance[0] - data.price) / data.price * 100);
    if (distToResistance < 3) adviceItems.push({ text: `Price is approaching resistance at $${data.resistance[0].toFixed(2)} — may face selling pressure here.`, type: 'info' });
  }

  // Volume
  if (data.volume_vs_avg != null) {
    if (data.volume_vs_avg > 50) adviceItems.push({ text: 'Volume is significantly above average — strong conviction behind the current move.', type: 'info' });
    else if (data.volume_vs_avg < -40) adviceItems.push({ text: 'Volume is very low — the current price action lacks conviction.', type: 'caution' });
  }

  if (adviceItems.length === 0) {
    adviceItems.push({ text: 'No strong technical signals right now. This is a good time to review your thesis and set alerts for key levels.', type: 'info' });
  }

  const typeIcon = { positive: '\u2705', caution: '\u26A0\uFE0F', opportunity: '\u2728', info: '\u2139\uFE0F' };
  const typeColor = { positive: C.green, caution: C.amber, opportunity: C.blue, info: C.textMuted };

  return (
    <div style={{ ...cardStyle, padding: 16, borderColor: signalColor + '33' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ ...labelSt }}>What Should I Do?</div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
          background: signalColor + '22', color: signalColor,
        }}>
          Signal: {signal}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {adviceItems.map((item, i) => (
          <div key={i} style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            animation: 'fadeSlideUp 0.25s ease-out both',
            animationDelay: `${i * 0.05}s`,
          }}>
            <span style={{ fontSize: 14, lineHeight: 1.5, flexShrink: 0 }}>{typeIcon[item.type]}</span>
            <span style={{ fontSize: 12, color: typeColor[item.type], lineHeight: 1.6 }}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Learning Tip ── */
const LearnTip = ({ title, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: C.accent + '08', border: `1px solid ${C.accent}22`, borderRadius: 12,
      overflow: 'hidden', transition: 'border-color 0.2s',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
          color: C.accent, fontSize: 11, fontWeight: 700, minHeight: 40,
        }}
      >
        <span>{title}</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', fontSize: 14 }}>&#9660;</span>
      </button>
      {open && (
        <div style={{
          padding: '0 14px 12px', fontSize: 12, color: C.textMuted, lineHeight: 1.7,
          animation: 'fadeSlideUp 0.2s ease-out',
        }}>
          {children}
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   SUB-TAB DEFINITIONS
   ══════════════════════════════════════════════════════════════════════ */
const SUB_TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'signals',    label: 'Signals' },
  { id: 'position',   label: 'Position' },
  { id: 'news',       label: 'News' },
];

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT — TechnicalsTab
   ══════════════════════════════════════════════════════════════════════ */
/**
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings
 */
export default function TechnicalsTab({ holdings }) {
  const [selectedStock, setSelectedStock] = useState(null);
  const [techData, setTechData] = useState({});
  const [loading, setLoading] = useState({});
  const [newsData, setNewsData] = useState({});
  const [newsLoading, setNewsLoading] = useState({});
  const [fundamentals, setFundamentals] = useState({});
  const [fundLoading, setFundLoading] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState('3M');
  const [priceHistoryData, setPriceHistoryData] = useState({});
  const [priceHistoryLoading, setPriceHistoryLoading] = useState({});
  const [compareMode, setCompareMode] = useState(false);
  const [compareTickers, setCompareTickers] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('overview');
  const [quickScanOpen, setQuickScanOpen] = useState(false);
  const [expandedSignal, setExpandedSignal] = useState(null);

  const tickers = useMemo(() =>
    [...new Set(holdings.filter(h => !h.is_manual && (h.type === 'Stock' || h.type === 'ETF' || h.type === 'Fund' || h.type === 'Crypto')).map(h => h.ticker))],
    [holdings]
  );

  useEffect(() => {
    if (tickers.length > 0 && !selectedStock) setSelectedStock(tickers[0]);
  }, [tickers.join(',')]);

  useEffect(() => { setActiveSubTab('overview'); }, [selectedStock]);

  // Load technicals for all tickers
  useEffect(() => {
    tickers.forEach(async (ticker) => {
      if (techData[ticker] || loading[ticker]) return;
      setLoading(prev => ({ ...prev, [ticker]: true }));
      try {
        const data = await api.getTechnicals(ticker);
        setTechData(prev => ({ ...prev, [ticker]: data }));
      } catch { /* ignore */ } finally {
        setLoading(prev => ({ ...prev, [ticker]: false }));
      }
    });
  }, [tickers.join(',')]);

  // Load news when needed
  useEffect(() => {
    if (!selectedStock || newsData[selectedStock] || newsLoading[selectedStock]) return;
    setNewsLoading(prev => ({ ...prev, [selectedStock]: true }));
    api.getNews(selectedStock)
      .then(data => setNewsData(prev => ({ ...prev, [selectedStock]: data })))
      .catch(() => {})
      .finally(() => setNewsLoading(prev => ({ ...prev, [selectedStock]: false })));
  }, [selectedStock]);

  // Load price history
  useEffect(() => {
    if (!selectedStock) return;
    const key = `${selectedStock}-${selectedPeriod}`;
    if (priceHistoryData[key] || priceHistoryLoading[key]) return;
    setPriceHistoryLoading(prev => ({ ...prev, [key]: true }));
    api.getPriceHistory(selectedStock, selectedPeriod.toLowerCase())
      .then(data => setPriceHistoryData(prev => ({ ...prev, [key]: data })))
      .catch(() => {})
      .finally(() => setPriceHistoryLoading(prev => ({ ...prev, [key]: false })));
  }, [selectedStock, selectedPeriod]);

  // Load price history for compare tickers
  useEffect(() => {
    if (!compareMode) return;
    compareTickers.forEach(ticker => {
      const key = `${ticker}-${selectedPeriod}`;
      if (priceHistoryData[key] || priceHistoryLoading[key]) return;
      setPriceHistoryLoading(prev => ({ ...prev, [key]: true }));
      api.getPriceHistory(ticker, selectedPeriod.toLowerCase())
        .then(data => setPriceHistoryData(prev => ({ ...prev, [key]: data })))
        .catch(() => {})
        .finally(() => setPriceHistoryLoading(prev => ({ ...prev, [key]: false })));
    });
  }, [compareMode, compareTickers.join(','), selectedPeriod]);

  // Load fundamentals
  useEffect(() => {
    if (!selectedStock) return;
    const holding = holdings.find(h => h.ticker === selectedStock);
    if (!holding || holding.type !== 'Stock') return;
    if (fundamentals[selectedStock] || fundLoading[selectedStock]) return;
    setFundLoading(prev => ({ ...prev, [selectedStock]: true }));
    api.getFundamentals(selectedStock)
      .then(data => setFundamentals(prev => ({ ...prev, [selectedStock]: data })))
      .catch(() => {})
      .finally(() => setFundLoading(prev => ({ ...prev, [selectedStock]: false })));
  }, [selectedStock]);

  const selectedData = selectedStock ? techData[selectedStock] : null;
  const selectedHolding = holdings.find(h => h.ticker === selectedStock);

  // Portfolio-wide health summary
  const portfolioHealth = useMemo(() => {
    const scores = tickers.map(t => computeHealthScore(techData[t])).filter(s => s != null);
    if (scores.length === 0) return null;
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const bullish = scores.filter(s => s >= 60).length;
    const bearish = scores.filter(s => s < 40).length;
    const neutral = scores.length - bullish - bearish;
    return { avg, bullish, bearish, neutral, total: scores.length };
  }, [tickers.join(','), Object.keys(techData).join(',')]);

  const alertCount = Object.values(techData).filter(t => t.alerts?.length > 0).length;

  const handleCompareToggle = () => {
    if (compareMode) { setCompareMode(false); setCompareTickers([]); }
    else { setCompareMode(true); setCompareTickers(selectedStock ? [selectedStock] : []); }
  };

  const handleCompareTickerToggle = (ticker) => {
    setCompareTickers(prev => {
      if (prev.includes(ticker)) return prev.filter(t => t !== ticker);
      if (prev.length >= 3) return prev;
      return [...prev, ticker];
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── 1. Portfolio Health Dashboard ──────────────────── */}
      {portfolioHealth && (
        <div style={{
          ...cardStyle, padding: 16,
          background: `linear-gradient(135deg, ${C.card} 0%, ${C.elevated}44 100%)`,
          animation: 'fadeSlideUp 0.35s ease-out both',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <HealthGauge score={portfolioHealth.avg} size={100} />
              <div>
                <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Portfolio Technical Health
                </div>
                <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                  Based on {portfolioHealth.total} position{portfolioHealth.total > 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.green, ...numSt }}>{portfolioHealth.bullish}</div>
                <div style={{ fontSize: 9, color: C.green, fontWeight: 600, textTransform: 'uppercase' }}>Bullish</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.amber, ...numSt }}>{portfolioHealth.neutral}</div>
                <div style={{ fontSize: 9, color: C.amber, fontWeight: 600, textTransform: 'uppercase' }}>Neutral</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.red, ...numSt }}>{portfolioHealth.bearish}</div>
                <div style={{ fontSize: 9, color: C.red, fontWeight: 600, textTransform: 'uppercase' }}>Bearish</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Stock Selector ─────────────────────────────── */}
      <div data-no-swipe style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', minWidth: 'max-content' }}>
          {tickers.map((t, i) => {
            const hasAlert = techData[t]?.alerts?.length > 0;
            const score = computeHealthScore(techData[t]);
            const isActive = compareMode ? compareTickers.includes(t) : selectedStock === t;
            const tickerColor = TICKER_COLORS[i % TICKER_COLORS.length];
            const scoreColor = score != null ? healthLabel(score).color : C.textDim;

            return (
              <button
                key={t}
                onClick={() => compareMode ? handleCompareTickerToggle(t) : setSelectedStock(t)}
                style={{
                  padding: '8px 12px', borderRadius: 10, minHeight: 44, flexShrink: 0,
                  border: `1px solid ${isActive ? (compareMode ? tickerColor : C.accent) : hasAlert ? C.amber + '66' : C.border}`,
                  background: isActive ? (compareMode ? tickerColor + '18' : C.accent + '14') : C.card,
                  cursor: 'pointer', fontFamily: MONO, position: 'relative',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  opacity: compareMode && compareTickers.length >= 3 && !compareTickers.includes(t) ? 0.4 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {hasAlert && !compareMode && (
                  <span style={{
                    position: 'absolute', top: -3, right: -3, width: 8, height: 8,
                    background: C.amber, borderRadius: '50%', border: `2px solid ${C.card}`,
                  }} />
                )}
                <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? (compareMode ? tickerColor : C.accent) : C.text }}>{t}</span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {techData[t]?.price != null && (
                    <span style={{ fontSize: 9, color: isActive ? 'inherit' : C.textDim, ...numSt }}>${techData[t].price.toFixed(0)}</span>
                  )}
                  {score != null && (
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: scoreColor }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. Action Bar ─────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={handleCompareToggle}
          style={{
            padding: '7px 14px', borderRadius: 8, minHeight: 36,
            border: `1px solid ${compareMode ? C.accent : C.border}`,
            background: compareMode ? C.accent + '22' : C.card,
            color: compareMode ? C.accent : C.textMuted,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: MONO,
            transition: 'all 0.15s',
          }}
        >
          {compareMode ? 'Exit Compare' : 'Compare'}
        </button>
        {compareMode && (
          <span style={{ fontSize: 10, color: C.textDim }}>{compareTickers.length}/3 selected</span>
        )}
        {!compareMode && alertCount > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '4px 8px', borderRadius: 6,
            background: C.amber + '18', color: C.amber,
          }}>
            {alertCount} alert{alertCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── 4. Main Content ───────────────────────────────── */}
      {compareMode ? (
        <>
          <ComparisonChart
            compareTickers={compareTickers}
            priceHistoryData={priceHistoryData}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
            tickers={tickers}
            isLoading={compareTickers.some(t => priceHistoryLoading[`${t}-${selectedPeriod}`])}
          />
          {compareTickers.length >= 2 && (
            <ComparisonTable compareTickers={compareTickers} techData={techData} tickers={tickers} />
          )}
        </>
      ) : selectedStock && selectedData ? (
        <>
          {/* Ticker Header */}
          <div style={{
            ...cardStyle, padding: 14,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <span style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: MONO }}>{selectedData.ticker}</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: C.text, marginLeft: 10, fontFamily: MONO, ...numSt }}>
                  ${selectedData.price?.toFixed(2)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(() => {
                const score = computeHealthScore(selectedData);
                const { text, color } = score != null ? healthLabel(score) : {};
                return score != null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color, fontFamily: MONO }}>{score}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color, textTransform: 'uppercase' }}>{text}</span>
                  </div>
                ) : null;
              })()}
              <span style={{
                background: (selectedData.trend?.includes('Bull') ? C.green : selectedData.trend?.includes('Bear') ? C.red : C.amber) + '22',
                color: selectedData.trend?.includes('Bull') ? C.green : selectedData.trend?.includes('Bear') ? C.red : C.amber,
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              }}>
                {selectedData.trend}
              </span>
            </div>
          </div>

          {/* Sub-tab pills */}
          <div style={{
            display: 'flex', gap: 2,
            background: C.bg, borderRadius: 10, padding: 3,
            border: `1px solid ${C.border}`, width: 'fit-content',
          }}>
            {SUB_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none', minHeight: 36,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: activeSubTab === tab.id ? C.accent : 'transparent',
                  color: activeSubTab === tab.id ? '#fff' : C.textMuted,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sub-tab content */}
          {activeSubTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeSlideUp 0.3s ease-out' }}>
              {/* Decision helper */}
              <ActionAdvice data={selectedData} />

              {/* Price chart */}
              <PriceChart
                data={priceHistoryData[`${selectedStock}-${selectedPeriod}`] || selectedData.price_history_60d}
                support={selectedData.support}
                resistance={selectedData.resistance}
                sma50={selectedData.sma50}
                sma200={selectedData.sma200}
                period={selectedPeriod}
                onPeriodChange={setSelectedPeriod}
                isLoading={priceHistoryLoading[`${selectedStock}-${selectedPeriod}`]}
              />

              {/* Price levels */}
              <PriceLadder
                price={selectedData.price}
                support={selectedData.support}
                resistance={selectedData.resistance}
                sma50={selectedData.sma50}
                sma200={selectedData.sma200}
              />
            </div>
          )}

          {activeSubTab === 'signals' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeSlideUp 0.3s ease-out' }}>
              {/* RSI */}
              <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <RSIGauge rsi={selectedData.rsi} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ ...labelSt, marginBottom: 6 }}>Relative Strength Index (14)</div>
                  <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
                    {selectedData.rsi != null ? rsiZone(selectedData.rsi).tip : 'RSI data not yet available.'}
                  </div>
                </div>
              </div>

              {/* Signal cards */}
              <SignalCard
                icon={selectedData.sma50 && selectedData.price > selectedData.sma50 ? '\u2191' : '\u2193'}
                title="50-Day Moving Average"
                value={selectedData.sma50 ? `$${selectedData.sma50.toFixed(2)}` : '—'}
                valueColor={selectedData.sma50 && selectedData.price > selectedData.sma50 ? C.green : C.red}
                status={selectedData.sma50 && selectedData.price > selectedData.sma50 ? 'Above' : 'Below'}
                statusColor={selectedData.sma50 && selectedData.price > selectedData.sma50 ? C.green : C.red}
                tip={selectedData.sma50 && selectedData.price > selectedData.sma50
                  ? 'Price is above the 50-day moving average — the short-term trend is up. This is generally a positive sign for momentum.'
                  : 'Price is below the 50-day moving average — the short-term trend is down. This suggests weakening momentum.'}
                expanded={expandedSignal === 'sma50'}
                onToggle={() => setExpandedSignal(expandedSignal === 'sma50' ? null : 'sma50')}
              />

              <SignalCard
                icon={selectedData.sma200 && selectedData.price > selectedData.sma200 ? '\u2191' : '\u2193'}
                title="200-Day Moving Average"
                value={selectedData.sma200 ? `$${selectedData.sma200.toFixed(2)}` : '—'}
                valueColor={selectedData.sma200 && selectedData.price > selectedData.sma200 ? C.green : C.red}
                status={selectedData.sma200 && selectedData.price > selectedData.sma200 ? 'Above' : 'Below'}
                statusColor={selectedData.sma200 && selectedData.price > selectedData.sma200 ? C.green : C.red}
                tip="The 200-day moving average is the most important long-term trend indicator. Being above it means the overall trend is bullish — below it signals caution."
                expanded={expandedSignal === 'sma200'}
                onToggle={() => setExpandedSignal(expandedSignal === 'sma200' ? null : 'sma200')}
              />

              {selectedData.sma50 && selectedData.sma200 && (
                <SignalCard
                  icon={selectedData.sma50 > selectedData.sma200 ? '\u2728' : '\u26A0\uFE0F'}
                  title="Golden / Death Cross"
                  value={selectedData.sma50 > selectedData.sma200 ? 'Golden Cross' : 'Death Cross'}
                  valueColor={selectedData.sma50 > selectedData.sma200 ? C.green : C.red}
                  status={selectedData.sma50 > selectedData.sma200 ? 'Bullish' : 'Bearish'}
                  statusColor={selectedData.sma50 > selectedData.sma200 ? C.green : C.red}
                  tip={selectedData.sma50 > selectedData.sma200
                    ? 'The 50-day MA is above the 200-day MA (Golden Cross). This is a strong bullish signal historically associated with the start of major uptrends.'
                    : 'The 50-day MA is below the 200-day MA (Death Cross). This is a bearish signal that often precedes extended downtrends.'}
                  expanded={expandedSignal === 'cross'}
                  onToggle={() => setExpandedSignal(expandedSignal === 'cross' ? null : 'cross')}
                />
              )}

              <SignalCard
                icon={selectedData.volume_vs_avg > 20 ? '\u{1F4CA}' : '\u{1F4C9}'}
                title="Volume Analysis"
                value={selectedData.volume_vs_avg != null ? `${selectedData.volume_vs_avg > 0 ? '+' : ''}${selectedData.volume_vs_avg.toFixed(0)}% vs avg` : '—'}
                valueColor={selectedData.volume_vs_avg > 20 ? C.green : selectedData.volume_vs_avg < -20 ? C.red : C.amber}
                status={selectedData.volume_vs_avg > 20 ? 'High' : selectedData.volume_vs_avg < -20 ? 'Low' : 'Normal'}
                statusColor={selectedData.volume_vs_avg > 20 ? C.green : selectedData.volume_vs_avg < -20 ? C.red : C.amber}
                tip="Volume confirms price moves. High volume on an uptrend = strong conviction. Low volume on a move = weak signal. Always check if volume supports the trend."
                expanded={expandedSignal === 'volume'}
                onToggle={() => setExpandedSignal(expandedSignal === 'volume' ? null : 'volume')}
              />

              {/* Learning section */}
              <LearnTip title="Learn: What are Moving Averages?">
                <p style={{ margin: '0 0 8px' }}>Moving averages smooth out price data to show the underlying trend. The <strong style={{ color: C.text }}>50-day MA</strong> shows the medium-term trend, while the <strong style={{ color: C.text }}>200-day MA</strong> shows the long-term trend.</p>
                <p style={{ margin: '0 0 8px' }}>When the shorter MA crosses above the longer one, it&apos;s called a <strong style={{ color: C.green }}>Golden Cross</strong> (bullish). The opposite is a <strong style={{ color: C.red }}>Death Cross</strong> (bearish).</p>
                <p style={{ margin: 0 }}>Pro tip: Moving averages work best in trending markets. In sideways markets, they can give false signals.</p>
              </LearnTip>

              <LearnTip title="Learn: What is RSI?">
                <p style={{ margin: '0 0 8px' }}>RSI (Relative Strength Index) measures momentum on a scale of 0-100. It tells you if a stock has been bought too aggressively (overbought, &gt;70) or sold too aggressively (oversold, &lt;30).</p>
                <p style={{ margin: '0 0 8px' }}>An oversold RSI doesn&apos;t mean &quot;buy now&quot; — it means the selling pressure is extreme and a bounce is likely. Always combine with other signals.</p>
                <p style={{ margin: 0 }}>Pro tip: In strong uptrends, RSI can stay overbought for weeks. Don&apos;t sell just because RSI is high if the trend is strong.</p>
              </LearnTip>
            </div>
          )}

          {activeSubTab === 'position' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeSlideUp 0.3s ease-out' }}>
              <PositionCard holding={selectedHolding} />
              <FundamentalsPanel
                data={fundamentals[selectedStock]}
                loading={fundLoading[selectedStock]}
              />
            </div>
          )}

          {activeSubTab === 'news' && (
            <div style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
              <NewsFeed
                articles={newsData[selectedStock]?.articles}
                ticker={selectedStock}
                loading={newsLoading[selectedStock]}
              />
            </div>
          )}
        </>
      ) : selectedStock && loading[selectedStock] ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonChart height={360} />
          <SkeletonCard height={100} />
        </div>
      ) : selectedStock ? (
        <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: C.textMuted }}>
          No technical data for {selectedStock} yet. Price history is still being fetched.
        </div>
      ) : null}

      {/* ── 5. Quick Scan ─────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: 16 }}>
        <button
          onClick={() => setQuickScanOpen(o => !o)}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            width: '100%', border: 'none', background: 'none', cursor: 'pointer',
            padding: 0, minHeight: 36,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: C.textMuted }}>
            {quickScanOpen ? '\u25BE' : '\u25B8'} Quick Scan — All Positions
          </span>
          {alertCount > 0 && (
            <span style={{ fontSize: 10, color: C.amber, fontWeight: 600 }}>
              {alertCount} alert{alertCount > 1 ? 's' : ''}
            </span>
          )}
        </button>
        {quickScanOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 12 }}>
            {tickers.map(t => (
              <QuickScanCard
                key={t}
                tech={techData[t]}
                isSelected={compareMode ? compareTickers.includes(t) : selectedStock === t}
                onClick={() => compareMode ? handleCompareTickerToggle(t) : setSelectedStock(t)}
                isLoading={loading[t]}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 6. Disclaimer ─────────────────────────────────── */}
      <div style={{
        fontSize: 10, color: C.textDim, textAlign: 'center',
        padding: '12px 0', borderTop: `1px solid ${C.border}`,
      }}>
        Technical signals are approximate and for educational purposes only. Always do your own research before making investment decisions.
      </div>
    </div>
  );
}
