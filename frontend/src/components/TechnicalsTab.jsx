import { useState, useEffect } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO, SANS, TICKER_COLORS } from '../styles/theme';
import { SkeletonChart, SkeletonCard, SkeletonText } from './SkeletonLoader';

/* ── Helper: RSI plain-English interpretation ── */
const rsiInterpretation = (rsi) => {
  if (rsi >= 80) return "Strongly overbought — high risk of pullback.";
  if (rsi >= 70) return "Approaching overbought territory, watch for pullback.";
  if (rsi >= 60) return "Bullish momentum, trending above neutral.";
  if (rsi >= 40) return "Neutral momentum, no strong signal either way.";
  if (rsi >= 30) return "Weakening momentum, approaching oversold.";
  if (rsi >= 20) return "Oversold — potential bounce opportunity.";
  return "Deeply oversold — strong reversal potential.";
};

/* ── Helper: Sentiment signal arrow ── */
const SignalFactor = ({ factor }) => {
  const arrow = factor.direction === 'above' ? '↑' : factor.direction === 'below' ? '↓' : '→';
  const color = factor.direction === 'above' ? C.green : factor.direction === 'below' ? C.red : C.amber;
  const label = factor.direction === 'above' ? `Above ${factor.label}`
    : factor.direction === 'below' ? `Below ${factor.label}`
    : `RSI ${factor.direction}`;
  return (
    <span style={{ color, fontSize: 11, marginRight: 12 }}>
      {arrow} {label}
    </span>
  );
};

/* ── Alert Badge ── */
const AlertBadge = ({ alerts }) => {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {alerts.map((a, i) => (
        <span key={i} style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: '#f59e0b22', color: C.amber, border: `1px solid ${C.amber}44`,
        }}>⚠ {a}</span>
      ))}
    </div>
  );
};

/* ── Volume Indicator ── */
const VolumeIndicator = ({ volume, avgVolume, volumeVsAvg }) => {
  if (!volume && volume !== 0) return null;
  const isHigh = volumeVsAvg > 20;
  const isLow = volumeVsAvg < -20;
  const color = isHigh ? C.green : isLow ? C.red : C.textMuted;
  const sign = volumeVsAvg > 0 ? '+' : '';
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Volume</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.text }}>
          {(volume / 1e6).toFixed(1)}M
        </span>
        <span style={{ fontSize: 11, color: C.textDim }}>vs 30d avg</span>
        <span style={{
          fontSize: 12, fontWeight: 700, fontFamily: MONO, color,
          background: color + '15', padding: '2px 8px', borderRadius: 4,
        }}>
          {sign}{volumeVsAvg}%
        </span>
        <span style={{ fontSize: 10, color: C.textDim }}>
          {isHigh ? '— strong conviction' : isLow ? '— low conviction' : '— normal activity'}
        </span>
      </div>
    </div>
  );
};

const PERIODS = ['1W', '1M', '3M', '6M', '1Y', 'MAX'];

/* ── Period Selector ── */
const PeriodSelector = ({ period, onPeriodChange }) => (
  <div style={{ display: 'flex', gap: 2 }}>
    {PERIODS.map(p => (
      <button key={p} onClick={() => onPeriodChange(p)} style={{
        padding: '8px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
        fontSize: 11, fontWeight: 700, fontFamily: MONO, minHeight: 44,
        background: period === p ? C.accent + '33' : 'transparent',
        color: period === p ? C.accent : C.textDim,
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
        onMouseEnter={e => { if (period !== p) e.currentTarget.style.color = C.text; }}
        onMouseLeave={e => { if (period !== p) e.currentTarget.style.color = C.textDim; }}
      >{p}</button>
    ))}
  </div>
);

/* ── Anti-collision nudger for pill labels ── */
const CHART_INNER_H = 364; // 380 chart height − 12 top margin − 4 bottom margin

const computeNudges = (items, minY, maxY) => {
  if (items.length === 0) return {};
  const range = maxY - minY;
  if (range === 0) return {};
  const toPixel = v => (1 - (v - minY) / range) * CHART_INNER_H;
  const pts = items.map(item => ({ key: item.key, px: toPixel(item.value), nudgedPx: toPixel(item.value) }));
  pts.sort((a, b) => a.nudgedPx - b.nudgedPx);
  const MIN_GAP = 18;
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const gap = pts[i].nudgedPx - pts[i - 1].nudgedPx;
      if (gap < MIN_GAP) {
        const d = (MIN_GAP - gap) / 2;
        pts[i - 1].nudgedPx -= d;
        pts[i].nudgedPx += d;
      }
    }
  }
  return Object.fromEntries(pts.map(p => [p.key, p.nudgedPx - p.px]));
};

/* ── Pill Label SVG component for ReferenceLine ── */
const PillLabel = ({ viewBox, text, color, align, pixelOffset = 0 }) => {
  if (!viewBox) return null;
  const { x, y, width } = viewBox;
  const labelY = y + pixelOffset;
  const PILL_H = 16, PAD_X = 5;
  const textW = Math.ceil(text.length * 6.4);
  const rectW = textW + PAD_X * 2;

  const rectX     = align === 'right' ? x + width - rectW - 4 : x + 4;
  const textX     = align === 'right' ? x + width - PAD_X - 4 : x + 4 + PAD_X;
  const anchor    = align === 'right' ? 'end' : 'start';
  const connX     = align === 'right' ? rectX : rectX + rectW;

  return (
    <g>
      {Math.abs(pixelOffset) > 3 && (
        <line x1={connX} y1={labelY} x2={connX} y2={y}
          stroke={color} strokeWidth={1} strokeOpacity={0.35} strokeDasharray="2 2" />
      )}
      <rect x={rectX} y={labelY - PILL_H / 2} width={rectW} height={PILL_H} rx={3}
        fill={color} fillOpacity={0.85} />
      <text x={textX} y={labelY} textAnchor={anchor} dominantBaseline="middle"
        fill="white" fontSize={10} fontWeight={700}
        fontFamily="'JetBrains Mono', monospace">{text}</text>
    </g>
  );
};

/* ── Price History Chart (replaces the old S/R strip) ── */
const PriceHistoryChart = ({ data, support, resistance, sma50, sma200, price, period, onPeriodChange, isLoading }) => {
  if (!data || data.length === 0) return (
    <div style={{ marginTop: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
          Price vs Key Levels
        </div>
        <PeriodSelector period={period} onPeriodChange={onPeriodChange} />
      </div>
      {isLoading ? (
        <SkeletonChart height={380} />
      ) : (
        <div style={{ height: 380, background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, color: C.textDim }}>No data</span>
        </div>
      )}
    </div>
  );

  // Percentile-based Y-axis: keeps the normal trading zone expanded,
  // clips outlier spikes that would otherwise compress the readable range.
  const prices = data.map(d => d.close);
  const sorted = [...prices].sort((a, b) => a - b);
  const p5  = sorted[Math.floor(sorted.length * 0.05)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const rangePad = (p95 - p5) * 0.15;

  // Always keep current price + nearest S/R in view, even if outside p5-p95.
  const anchors = [price, ...(support || []).slice(0, 1), ...(resistance || []).slice(0, 1)].filter(Boolean);
  const minY = Math.min(p5 - rangePad, ...anchors);
  const maxY = Math.max(p95 + rangePad, ...anchors);

  // Build label items and compute anti-collision nudges
  const leftItems = [
    ...(support || []).slice(0, 2).map((s, i) => ({ key: `s${i}`, value: s, color: C.green, text: `S $${s.toFixed(0)}` })),
    ...(resistance || []).slice(0, 2).map((r, i) => ({ key: `r${i}`, value: r, color: C.red, text: `R $${r.toFixed(0)}` })),
  ].filter(l => l.value >= minY && l.value <= maxY);

  const rightItems = [
    sma50  ? { key: 'sma50',  value: sma50,  color: C.cyan,  text: `50d $${sma50.toFixed(0)}`   } : null,
    sma200 ? { key: 'sma200', value: sma200, color: C.pink,  text: `200d $${sma200.toFixed(0)}` } : null,
    { key: 'price', value: price, color: C.amber, text: `$${price.toFixed(2)}` },
  ].filter(Boolean).filter(l => l.value >= minY && l.value <= maxY);

  const leftNudges  = computeNudges(leftItems,  minY, maxY);
  const rightNudges = computeNudges(rightItems, minY, maxY);

  const fmtDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ marginTop: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
          Price vs Key Levels — {period}
        </div>
        <PeriodSelector period={period} onPeriodChange={onPeriodChange} />
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <AreaChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke={C.chartGrid} strokeOpacity={0.4} />
          <XAxis
            dataKey="date"
            tick={{ fill: C.textDim, fontSize: 11 }}
            tickFormatter={fmtDate}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minY, maxY]}
            tick={{ fill: C.textDim, fontSize: 11, fontFamily: MONO }}
            tickFormatter={v => `$${v.toFixed(0)}`}
            width={58}
          />
          <Tooltip cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const hovered = payload[0].value;
            const levels = [
              ...(support || []).slice(0, 2).map((s, i) => ({ label: i === 0 ? 'Support' : 'Support 2', value: s, color: C.green })),
              ...(resistance || []).slice(0, 2).map((r, i) => ({ label: i === 0 ? 'Resistance' : 'Resistance 2', value: r, color: C.red })),
              sma50  && { label: '50d SMA',  value: sma50,  color: C.cyan  },
              sma200 && { label: '200d SMA', value: sma200, color: C.pink  },
              { label: 'Current Price', value: price, color: C.amber },
            ].filter(Boolean);
            return (
              <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, minWidth: 160 }}>
                <div style={{ color: C.textDim, marginBottom: 4 }}>{fmtDate(label)}</div>
                <div style={{ color: C.text, fontWeight: 700, fontFamily: MONO, marginBottom: 6 }}>${hovered.toFixed(2)}</div>
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {levels.map(lvl => (
                    <div key={lvl.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: lvl.color, fontWeight: 600 }}>{lvl.label}</span>
                      <span style={{ fontSize: 10, fontFamily: MONO, color: C.textMuted }}>${lvl.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }} />

          {/* Support lines */}
          {(support || []).slice(0, 2).map((s, i) => (
            <ReferenceLine key={`s${i}`} y={s} stroke={C.green} strokeDasharray={i === 0 ? "0" : "4 4"} strokeWidth={i === 0 ? 2.5 : 1.5} strokeOpacity={i === 0 ? 0.9 : 0.45}
              label={(props) => <PillLabel {...props} text={`S $${s.toFixed(0)}`} color={C.green} align="left" pixelOffset={leftNudges[`s${i}`] ?? 0} />} />
          ))}

          {/* Resistance lines */}
          {(resistance || []).slice(0, 2).map((r, i) => (
            <ReferenceLine key={`r${i}`} y={r} stroke={C.red} strokeDasharray={i === 0 ? "0" : "4 4"} strokeWidth={i === 0 ? 2.5 : 1.5} strokeOpacity={i === 0 ? 0.9 : 0.45}
              label={(props) => <PillLabel {...props} text={`R $${r.toFixed(0)}`} color={C.red} align="left" pixelOffset={leftNudges[`r${i}`] ?? 0} />} />
          ))}

          {/* SMA50 */}
          {sma50 && (
            <ReferenceLine y={sma50} stroke={C.cyan} strokeDasharray="5 3" strokeWidth={2}
              label={(props) => <PillLabel {...props} text={`50d $${sma50.toFixed(0)}`} color={C.cyan} align="right" pixelOffset={rightNudges['sma50'] ?? 0} />} />
          )}

          {/* SMA200 */}
          {sma200 && (
            <ReferenceLine y={sma200} stroke={C.pink} strokeDasharray="5 3" strokeWidth={2}
              label={(props) => <PillLabel {...props} text={`200d $${sma200.toFixed(0)}`} color={C.pink} align="right" pixelOffset={rightNudges['sma200'] ?? 0} />} />
          )}

          {/* Current price */}
          <ReferenceLine y={price} stroke={C.amber} strokeWidth={2.5}
            label={(props) => <PillLabel {...props} text={`$${price.toFixed(2)}`} color={C.amber} align="right" pixelOffset={rightNudges['price'] ?? 0} />} />

          <Area type="monotone" dataKey="close" stroke={C.accent} strokeWidth={2.5} fill="url(#priceGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, fontSize: 10, color: C.textMuted, marginTop: 10, flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: C.green, marginRight: 4, verticalAlign: 'middle' }} />Support</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: C.red, marginRight: 4, verticalAlign: 'middle' }} />Resistance</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: C.amber, marginRight: 4, verticalAlign: 'middle' }} />Current Price</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 0, borderTop: `2px dashed ${C.cyan}`, marginRight: 4, verticalAlign: 'middle' }} />50d SMA</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 0, borderTop: `2px dashed ${C.pink}`, marginRight: 4, verticalAlign: 'middle' }} />200d SMA</span>
      </div>
    </div>
  );
};

/* ── News Feed ── */
const NewsFeed = ({ articles, ticker, loading: isLoading }) => {
  if (isLoading) {
    return <SkeletonCard height={80} style={{ marginTop: 16 }} />;
  }
  if (!articles || articles.length === 0) return null;

  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, marginTop: 12 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Recent News</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {articles.slice(0, 5).map((a, i) => {
          const hoursAgo = a.published_at
            ? Math.round((Date.now() / 1000 - a.published_at) / 3600)
            : null;
          return (
            <a key={i} href={a.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <div style={{
                padding: '8px 12px', background: C.elevated, borderRadius: 6,
                border: `1px solid ${C.border}`, cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + '66'}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4, marginBottom: 3 }}>{a.title}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>
                  {a.publisher}{hoursAgo !== null && hoursAgo >= 0 ? ` · ${hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.round(hoursAgo / 24)}d ago`}` : ''}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
};

/* ── Valuation Card ── */
const ValuationCard = ({ data, loading: isLoading }) => {
  if (isLoading) return <SkeletonCard height={100} style={{ marginTop: 12 }} />;
  if (!data) return null;

  const metrics = [
    { label: 'Trailing P/E', value: data.trailing_pe != null ? data.trailing_pe.toFixed(1) : '—' },
    { label: 'Forward P/E', value: data.forward_pe != null ? data.forward_pe.toFixed(1) : '—' },
    { label: 'EPS Growth', value: data.earnings_growth != null ? `${(data.earnings_growth * 100).toFixed(1)}%` : '—' },
    { label: 'Div Yield', value: data.dividend_yield != null ? `${data.dividend_yield.toFixed(2)}%` : '—' },
  ];

  const fmtCalDate = (val) => {
    if (!val) return null;
    if (typeof val === 'number') {
      return new Date(val * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    if (typeof val === 'string') return val;
    return null;
  };

  const earningsStr = fmtCalDate(data.earnings_date);
  const exDivStr = fmtCalDate(data.ex_dividend_date);

  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, marginTop: 12 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
        Valuation{data.sector ? ` — ${data.sector}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: C.elevated, padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 9, color: C.textDim, fontWeight: 600, marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.text }}>{m.value}</div>
          </div>
        ))}
      </div>
      {(earningsStr || exDivStr) && (
        <div style={{ marginTop: 8, fontSize: 10, color: C.textDim, display: 'flex', gap: 16 }}>
          {earningsStr && <span>Earnings: <span style={{ color: C.amber }}>{earningsStr}</span></span>}
          {exDivStr && <span>Ex-Div: <span style={{ color: C.cyan }}>{exDivStr}</span></span>}
        </div>
      )}
    </div>
  );
};

/* ── Alerts Summary Panel ── */
const AlertsSummary = ({ techData, onSelectStock }) => {
  // Group alerts by ticker
  const grouped = Object.entries(techData)
    .filter(([, t]) => t.alerts && t.alerts.length > 0)
    .map(([ticker, t]) => ({ ticker, alerts: t.alerts }));

  if (grouped.length === 0) return null;

  const totalAlerts = grouped.reduce((n, g) => n + g.alerts.length, 0);

  const alertColor = (alert) => {
    if (alert.includes('oversold') || alert.includes('support')) return C.green;
    if (alert.includes('overbought') || alert.includes('resistance') || alert.includes('Death')) return C.red;
    if (alert.includes('Golden')) return C.cyan;
    return C.amber;
  };

  const shortLabel = (alert) =>
    alert.replace(/^Near\s+/i, '').replace(/^RSI\s+/i, 'RSI ');

  return (
    <div style={{
      background: C.card, borderRadius: 16, border: `1px solid ${C.amber}33`,
      padding: 12, marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 8 }}>
        Active Alerts ({totalAlerts}) — {grouped.length} ticker{grouped.length > 1 ? 's' : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
        {grouped.map(({ ticker, alerts }) => (
          <div key={ticker} onClick={() => onSelectStock(ticker)} style={{
            padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
            background: C.elevated, border: `1px solid ${C.border}`,
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + '66'}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text }}>{ticker}</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
              {alerts.map((a, i) => {
                const col = alertColor(a);
                return (
                  <span key={i} style={{
                    fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                    background: col + '18', color: col,
                  }}>{shortLabel(a)}</span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   TechnicalCard — full detail view for a selected stock
   ══════════════════════════════════════════════════════════════════════ */
const PositionSummary = ({ holding }) => {
  if (!holding) return null;
  const { shares, market_value, avg_cost, actual_allocation, gain_loss, gain_loss_pct, day_change_pct, current_price, previous_close } = holding;
  const dayReturn = current_price && previous_close ? (current_price - previous_close) * shares : 0;
  const totalColor = gain_loss >= 0 ? C.green : C.red;
  const dayColor = day_change_pct >= 0 ? C.green : C.red;

  return (
    <div style={{ background: C.elevated, borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Your Position</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 2 }}>Shares</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.text }}>{shares % 1 === 0 ? shares : shares.toFixed(4)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 2 }}>Market value</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.text }}>${market_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 2 }}>Average cost</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.text }}>${avg_cost.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 2 }}>Portfolio weight</div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.text }}>{actual_allocation}%</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 2 }}>Today's return</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: dayColor }}>
            {day_change_pct >= 0 ? '+' : ''}{dayReturn >= 0 ? '+' : ''}${Math.abs(dayReturn).toFixed(2)}{' '}
            <span style={{ fontSize: 13 }}>({day_change_pct >= 0 ? '+' : ''}{day_change_pct}%)</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 2 }}>Total return</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: totalColor }}>
            {gain_loss >= 0 ? '+' : ''}${Math.abs(gain_loss).toFixed(2)}{' '}
            <span style={{ fontSize: 13 }}>({gain_loss_pct >= 0 ? '+' : ''}{gain_loss_pct}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const TechnicalCard = ({ data, holding, priceHistory, priceHistoryLoading, selectedPeriod, onPeriodChange }) => {
  if (!data) return null;
  const { ticker, price, rsi, sma50, sma200, support, resistance, trend, note,
          volume, avg_volume_30, volume_vs_avg, alerts, signal_factors,
          price_history_60d, actionable_summary } = data;
  const chartData = priceHistory || price_history_60d;

  const trendColor = trend.includes('Bull') ? C.green : trend.includes('Bear') ? C.red : C.amber;
  const rsiColor = rsi > 70 ? C.red : rsi < 30 ? C.green : C.amber;

  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, marginBottom: 12 }}>
      {/* Header: Ticker, Price, Trend + Reasoning */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: MONO }}>{ticker}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.text, marginLeft: 12, fontFamily: MONO }}>${price.toFixed(2)}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ background: trendColor + '22', color: trendColor, padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, display: 'inline-block' }}>{trend}</span>
          {signal_factors && signal_factors.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 2 }}>
              {signal_factors.map((f, i) => <SignalFactor key={i} factor={f} />)}
            </div>
          )}
        </div>
      </div>

      {/* Your Position */}
      <PositionSummary holding={holding} />

      {/* Alert badges */}
      <AlertBadge alerts={alerts} />

      {/* Actionable Summary */}
      {actionable_summary && (
        <div style={{
          marginTop: 12, padding: '10px 14px', background: C.elevated, borderRadius: 6,
          fontSize: 12, color: C.text, lineHeight: 1.6,
          borderLeft: `3px solid ${trendColor}`, fontWeight: 500,
        }}>
          {actionable_summary}
        </div>
      )}

      {/* ─── Price History Chart ─── */}
      <PriceHistoryChart
        data={chartData}
        support={support}
        resistance={resistance}
        sma50={sma50}
        sma200={sma200}
        price={price}
        period={selectedPeriod}
        onPeriodChange={onPeriodChange}
        isLoading={priceHistoryLoading}
      />

      {/* ─── RSI with zones and interpretation ─── */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>RSI (14)</div>
        <div style={{ position: 'relative', height: 40, background: C.elevated, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', background: C.green + '12' }} />
          <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: '40%', background: C.amber + '08' }} />
          <div style={{ position: 'absolute', left: '70%', top: 0, bottom: 0, width: '30%', background: C.red + '12' }} />
          <span style={{ position: 'absolute', left: '8%', top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: C.green + 'aa', fontWeight: 600 }}>Oversold</span>
          <span style={{ position: 'absolute', left: '44%', top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: C.textDim, fontWeight: 600 }}>Neutral</span>
          <span style={{ position: 'absolute', right: '5%', top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: C.red + 'aa', fontWeight: 600 }}>Overbought</span>
          <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: 1, background: C.textDim + '33' }} />
          <div style={{ position: 'absolute', left: '70%', top: 0, bottom: 0, width: 1, background: C.textDim + '33' }} />
          <div style={{
            position: 'absolute', left: `${Math.min(Math.max(rsi, 2), 98)}%`,
            top: 3, bottom: 3, width: 4, background: rsiColor, borderRadius: 2, zIndex: 5,
            boxShadow: `0 0 8px ${rsiColor}88`,
            transform: 'translateX(-50%)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 10, color: C.textDim, fontFamily: MONO }}>0</span>
          <span style={{ fontSize: 10, color: C.textDim, fontFamily: MONO }}>30</span>
          <span style={{
            fontSize: 14, fontWeight: 700, color: rsiColor, fontFamily: MONO,
            background: rsiColor + '15', padding: '3px 12px', borderRadius: 4,
          }}>RSI {rsi.toFixed(0)}</span>
          <span style={{ fontSize: 10, color: C.textDim, fontFamily: MONO }}>70</span>
          <span style={{ fontSize: 10, color: C.textDim, fontFamily: MONO }}>100</span>
        </div>
        <div style={{
          marginTop: 10, fontSize: 12, color: C.textMuted, fontStyle: 'italic',
          padding: '8px 12px', background: rsiColor + '08', borderRadius: 4, borderLeft: `3px solid ${rsiColor}44`,
        }}>
          RSI at {rsi.toFixed(0)} — {rsiInterpretation(rsi)}
        </div>
      </div>

      {/* ─── Key Levels ─── */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>Key Levels</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {sma50 && (
            <div style={{ background: C.elevated, padding: '12px 14px', borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.cyan, fontWeight: 600, marginBottom: 4 }}>50d SMA</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: C.text }}>${sma50.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: price > sma50 ? C.green : C.red, marginTop: 4 }}>
                Price is {price > sma50 ? 'above' : 'below'} ({((price - sma50) / sma50 * 100).toFixed(1)}%)
              </div>
            </div>
          )}
          {sma200 && (
            <div style={{ background: C.elevated, padding: '12px 14px', borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.pink, fontWeight: 600, marginBottom: 4 }}>200d SMA</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: C.text }}>${sma200.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: price > sma200 ? C.green : C.red, marginTop: 4 }}>
                Price is {price > sma200 ? 'above' : 'below'} ({((price - sma200) / sma200 * 100).toFixed(1)}%)
              </div>
            </div>
          )}
          {support?.[0] && (
            <div style={{ background: C.elevated, padding: '12px 14px', borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.green, fontWeight: 600, marginBottom: 4 }}>Nearest Support</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: C.text }}>${support[0].toFixed(2)}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                {((price - support[0]) / support[0] * 100).toFixed(1)}% above
              </div>
            </div>
          )}
          {resistance?.[0] && (
            <div style={{ background: C.elevated, padding: '12px 14px', borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.red, fontWeight: 600, marginBottom: 4 }}>Nearest Resistance</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: C.text }}>${resistance[0].toFixed(2)}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
                {((resistance[0] - price) / price * 100).toFixed(1)}% above
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Volume ─── */}
      <VolumeIndicator volume={volume} avgVolume={avg_volume_30} volumeVsAvg={volume_vs_avg} />

      {/* ─── Technical Note ─── */}
      {note && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: C.elevated, borderRadius: 6, fontSize: 12, color: C.textMuted, lineHeight: 1.6, borderLeft: `3px solid ${trendColor}` }}>
          {note}
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   Quick Scan Card — compact view per stock, expandable on click
   ══════════════════════════════════════════════════════════════════════ */
const QuickScanCard = ({ tech, isSelected, onClick, isLoading }) => {
  if (!tech) return (
    <div style={{ padding: '10px 14px', background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` }}>
      <span style={{ fontWeight: 700, fontSize: 13, fontFamily: MONO }}>{isLoading ? '' : ''}</span>
      <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{isLoading ? 'Loading...' : 'No data'}</div>
    </div>
  );

  const trendCol = tech.trend.includes('Bull') ? C.green : tech.trend.includes('Bear') ? C.red : C.amber;
  const rsiCol = tech.rsi > 70 ? C.red : tech.rsi < 30 ? C.green : C.textMuted;
  const hasAlerts = tech.alerts && tech.alerts.length > 0;

  return (
    <div onClick={onClick} style={{
      padding: '10px 14px', background: C.elevated, borderRadius: 8, cursor: 'pointer',
      border: `1px solid ${isSelected ? C.accent + '66' : hasAlerts ? C.amber + '44' : C.border}`,
      transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasAlerts && <span style={{ fontSize: 10, color: C.amber }}>⚠</span>}
          <span style={{ fontWeight: 700, fontSize: 13, fontFamily: MONO }}>{tech.ticker}</span>
        </div>
        <span style={{ fontSize: 9, color: trendCol, fontWeight: 700, background: trendCol + '15', padding: '2px 6px', borderRadius: 4 }}>{tech.trend}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, marginTop: 4 }}>${tech.price.toFixed(2)}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 9, flexWrap: 'wrap' }}>
        <span style={{ color: rsiCol }}>RSI {tech.rsi.toFixed(0)}</span>
        {tech.sma50 && (
          <span style={{ color: tech.price > tech.sma50 ? C.green : C.red }}>
            {tech.price > tech.sma50 ? 'Above' : 'Below'} 50d
          </span>
        )}
        {tech.sma200 && (
          <span style={{ color: tech.price > tech.sma200 ? C.green : C.red }}>
            {tech.price > tech.sma200 ? 'Above' : 'Below'} 200d
          </span>
        )}
        {tech.volume_vs_avg !== undefined && (
          <span style={{ color: tech.volume_vs_avg > 20 ? C.green : tech.volume_vs_avg < -20 ? C.red : C.textDim }}>
            Vol {tech.volume_vs_avg > 0 ? '+' : ''}{tech.volume_vs_avg}%
          </span>
        )}
      </div>

      {/* Actionable summary — always visible */}
      {tech.actionable_summary && (
        <div style={{
          marginTop: 6, fontSize: 10, color: C.textMuted,
          fontStyle: 'italic', lineHeight: 1.5,
          borderLeft: `2px solid ${trendCol}44`, paddingLeft: 6,
        }}>
          {tech.actionable_summary}
        </div>
      )}

      {/* Expanded detail when selected */}
      {isSelected && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, fontSize: 10, lineHeight: 1.7 }}>
          {tech.sma50 && (
            <div style={{ color: tech.price > tech.sma50 ? C.green : C.red }}>
              Price is {tech.price > tech.sma50 ? 'above' : 'below'} 50d SMA (${tech.sma50.toFixed(0)}) by {Math.abs(((tech.price - tech.sma50) / tech.sma50 * 100)).toFixed(1)}%
            </div>
          )}
          {tech.sma200 && (
            <div style={{ color: tech.price > tech.sma200 ? C.green : C.red }}>
              Price is {tech.price > tech.sma200 ? 'above' : 'below'} 200d SMA (${tech.sma200.toFixed(0)}) by {Math.abs(((tech.price - tech.sma200) / tech.sma200 * 100)).toFixed(1)}%
            </div>
          )}
          <div style={{ color: C.textMuted, fontStyle: 'italic', marginTop: 2 }}>
            {rsiInterpretation(tech.rsi)}
          </div>
          {tech.alerts && tech.alerts.length > 0 && (
            <div style={{ color: C.amber, marginTop: 2 }}>
              ⚠ {tech.alerts.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Comparison Chart — overlaid normalized % change ── */
const ComparisonChart = ({ compareTickers, priceHistoryData, selectedPeriod, onPeriodChange, tickers, isLoading }) => {
  const fmtDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (compareTickers.length < 2) {
    return (
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 8 }}>Select at least 2 holdings to compare.</div>
        <div style={{ fontSize: 11, color: C.textDim }}>Tap tickers above to add them (max 3).</div>
      </div>
    );
  }

  if (isLoading) return <SkeletonChart height={380} />;

  // Gather and normalize price series
  const seriesMap = {};
  let commonDates = null;
  compareTickers.forEach(ticker => {
    const key = `${ticker}-${selectedPeriod}`;
    const raw = priceHistoryData[key];
    if (!raw || raw.length === 0) return;
    const firstClose = raw[0].close;
    const dateMap = {};
    raw.forEach(d => { dateMap[d.date] = ((d.close - firstClose) / firstClose) * 100; });
    seriesMap[ticker] = dateMap;
    const dates = new Set(raw.map(d => d.date));
    commonDates = commonDates ? new Set([...commonDates].filter(d => dates.has(d))) : dates;
  });

  if (!commonDates || commonDates.size === 0) return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center', marginBottom: 16 }}>
      <span style={{ fontSize: 12, color: C.textDim }}>No overlapping price data for selected tickers.</span>
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
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
          Normalized % Change — {selectedPeriod}
        </div>
        <PeriodSelector period={selectedPeriod} onPeriodChange={onPeriodChange} />
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={{ top: 12, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="4 4" stroke={C.chartGrid} strokeOpacity={0.4} />
          <XAxis dataKey="date" tick={{ fill: C.textDim, fontSize: 11 }} tickFormatter={fmtDate} interval="preserveStartEnd" />
          <YAxis tick={{ fill: C.textDim, fontSize: 11, fontFamily: MONO }} tickFormatter={v => `${v.toFixed(1)}%`} width={58} />
          <ReferenceLine y={0} stroke={C.textDim} strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip cursor={{ stroke: C.chartCrosshair, strokeDasharray: '4 4' }} content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 12, minWidth: 140 }}>
                <div style={{ color: C.textDim, marginBottom: 6 }}>{fmtDate(label)}</div>
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
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.textMuted, marginTop: 10, flexWrap: 'wrap' }}>
        {compareTickers.map(ticker => (
          <span key={ticker} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              display: 'inline-block', width: 14, height: 3, borderRadius: 2,
              background: TICKER_COLORS[tickers.indexOf(ticker) % TICKER_COLORS.length],
            }} />
            <span style={{ fontFamily: MONO, fontWeight: 700 }}>{ticker}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/* ── Comparison Table — side-by-side metrics ── */
const ComparisonTable = ({ compareTickers, techData, tickers }) => {
  const metrics = [
    {
      label: 'RSI (14)',
      getValue: (t) => {
        const d = techData[t];
        if (!d?.rsi) return { text: '—', color: C.textDim };
        const color = d.rsi > 70 ? C.red : d.rsi < 30 ? C.green : C.amber;
        return { text: d.rsi.toFixed(0), color };
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
      label: 'Dist. to Support',
      getValue: (t) => {
        const d = techData[t];
        if (!d?.price || !d?.support?.[0]) return { text: '—', color: C.textDim };
        const pct = ((d.price - d.support[0]) / d.price * 100);
        return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, color: C.textMuted };
      },
    },
    {
      label: 'Dist. to Resistance',
      getValue: (t) => {
        const d = techData[t];
        if (!d?.price || !d?.resistance?.[0]) return { text: '—', color: C.textDim };
        const pct = ((d.resistance[0] - d.price) / d.price * 100);
        return { text: `+${pct.toFixed(1)}%`, color: C.textMuted };
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

  const cellBg = C.elevated;

  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 14 }}>
        Side-by-Side Technicals
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', minWidth: compareTickers.length * 120 + 120 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 10, color: C.textDim, fontWeight: 600, padding: '6px 10px', textTransform: 'uppercase', letterSpacing: 1 }}>Metric</th>
              {compareTickers.map(ticker => (
                <th key={ticker} style={{ textAlign: 'right', padding: '6px 10px', fontSize: 12, fontWeight: 700, fontFamily: MONO }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: TICKER_COLORS[tickers.indexOf(ticker) % TICKER_COLORS.length],
                    }} />
                    <span style={{ color: C.text }}>{ticker}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(metric => (
              <tr key={metric.label}>
                <td style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, padding: '8px 10px', background: cellBg, borderRadius: '6px 0 0 6px' }}>
                  {metric.label}
                </td>
                {compareTickers.map((ticker, i) => {
                  const val = metric.getValue(ticker);
                  return (
                    <td key={ticker} style={{
                      textAlign: 'right', padding: '8px 10px', background: cellBg,
                      borderRadius: i === compareTickers.length - 1 ? '0 6px 6px 0' : 0,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: val.color }}>{val.text}</span>
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

/* ══════════════════════════════════════════════════════════════════════
   TechnicalsTab — main export
   ══════════════════════════════════════════════════════════════════════ */
/**
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings - Holdings to show technicals for
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

  const tickers = [...new Set(holdings.filter(h => !h.is_manual && (h.type === 'Stock' || h.type === 'ETF' || h.type === 'Fund' || h.type === 'Crypto')).map(h => h.ticker))];

  useEffect(() => {
    if (tickers.length > 0 && !selectedStock) {
      setSelectedStock(tickers[0]);
    }
  }, [tickers]);

  useEffect(() => {
    // Load technicals for all tickers
    tickers.forEach(async (ticker) => {
      if (techData[ticker] || loading[ticker]) return;
      setLoading(prev => ({ ...prev, [ticker]: true }));
      try {
        const data = await api.getTechnicals(ticker);
        setTechData(prev => ({ ...prev, [ticker]: data }));
      } catch {
        // Technicals may not be available yet
      } finally {
        setLoading(prev => ({ ...prev, [ticker]: false }));
      }
    });
  }, [tickers.join(',')]);

  // Load news when selectedStock changes
  useEffect(() => {
    if (!selectedStock || newsData[selectedStock] || newsLoading[selectedStock]) return;
    setNewsLoading(prev => ({ ...prev, [selectedStock]: true }));
    api.getNews(selectedStock)
      .then(data => setNewsData(prev => ({ ...prev, [selectedStock]: data })))
      .catch(() => {})
      .finally(() => setNewsLoading(prev => ({ ...prev, [selectedStock]: false })));
  }, [selectedStock]);

  // Load price history when selectedStock or selectedPeriod changes
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

  // Load price history for all compare tickers
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

  // Load fundamentals when selectedStock changes (Stocks only)
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

  // Count stocks with alerts
  const alertCount = Object.values(techData).filter(t => t.alerts && t.alerts.length > 0).length;

  const handleCompareToggle = () => {
    if (compareMode) {
      setCompareMode(false);
      setCompareTickers([]);
    } else {
      setCompareMode(true);
      setCompareTickers(selectedStock ? [selectedStock] : []);
    }
  };

  const handleCompareTickerToggle = (ticker) => {
    setCompareTickers(prev => {
      if (prev.includes(ticker)) return prev.filter(t => t !== ticker);
      if (prev.length >= 3) return prev;
      return [...prev, ticker];
    });
  };

  return (
    <div>
      {/* Alerts Summary Panel */}
      <AlertsSummary techData={techData} onSelectStock={setSelectedStock} />

      {/* Stock Selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {tickers.map(t => {
          const hasAlert = techData[t]?.alerts?.length > 0;
          const isActive = compareMode ? compareTickers.includes(t) : selectedStock === t;
          const tickerColor = TICKER_COLORS[tickers.indexOf(t) % TICKER_COLORS.length];
          return (
            <button
              key={t}
              onClick={() => compareMode ? handleCompareTickerToggle(t) : setSelectedStock(t)}
              style={{
                padding: '10px 14px', borderRadius: 8, minHeight: 44,
                border: `1px solid ${isActive ? (compareMode ? tickerColor : C.accent) : hasAlert ? C.amber + '66' : C.border}`,
                background: isActive ? (compareMode ? tickerColor + '22' : C.accent + '22') : C.card,
                color: isActive ? (compareMode ? tickerColor : C.accent) : C.textMuted,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO,
                position: 'relative',
                opacity: compareMode && compareTickers.length >= 3 && !compareTickers.includes(t) ? 0.45 : 1,
              }}
            >
              {hasAlert && !compareMode && (
                <span style={{
                  position: 'absolute', top: -3, right: -3, width: 8, height: 8,
                  background: C.amber, borderRadius: '50%', border: `2px solid ${C.card}`,
                }} />
              )}
              {compareMode && isActive && (
                <span style={{
                  position: 'absolute', top: -3, right: -3, width: 10, height: 10,
                  background: tickerColor, borderRadius: '50%', border: `2px solid ${C.card}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, color: '#fff', fontWeight: 800, lineHeight: 1,
                }}>✓</span>
              )}
              {t}
            </button>
          );
        })}
        {!compareMode && alertCount > 0 && (
          <span style={{ fontSize: 10, color: C.amber, marginLeft: 8 }}>
            ⚠ {alertCount} stock{alertCount > 1 ? 's' : ''} with alerts
          </span>
        )}
        {compareMode && (
          <span style={{ fontSize: 10, color: C.textDim, marginLeft: 4 }}>
            {compareTickers.length}/3 selected
          </span>
        )}
        <button
          onClick={handleCompareToggle}
          style={{
            padding: '10px 14px', borderRadius: 8, minHeight: 44, marginLeft: 'auto',
            border: `1px solid ${compareMode ? C.accent : C.border}`,
            background: compareMode ? C.accent + '22' : C.card,
            color: compareMode ? C.accent : C.textMuted,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: MONO,
            transition: 'background 0.15s, color 0.15s, border-color 0.15s',
          }}
        >
          {compareMode ? 'Compare ✓' : 'Compare'}
        </button>
      </div>

      {/* Compare Mode View */}
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
            <ComparisonTable
              compareTickers={compareTickers}
              techData={techData}
              tickers={tickers}
            />
          )}
        </>
      ) : (
        /* Selected Stock Detail */
        selectedStock && techData[selectedStock] ? (
          <>
            <TechnicalCard
              data={techData[selectedStock]}
              holding={holdings.find(h => h.ticker === selectedStock)}
              priceHistory={priceHistoryData[`${selectedStock}-${selectedPeriod}`]}
              priceHistoryLoading={priceHistoryLoading[`${selectedStock}-${selectedPeriod}`]}
              selectedPeriod={selectedPeriod}
              onPeriodChange={setSelectedPeriod}
            />
            <NewsFeed
              articles={newsData[selectedStock]?.articles}
              ticker={selectedStock}
              loading={newsLoading[selectedStock]}
            />
            {holdings.find(h => h.ticker === selectedStock)?.type === 'Stock' && (
              <ValuationCard
                data={fundamentals[selectedStock]}
                loading={fundLoading[selectedStock]}
              />
            )}
          </>
        ) : selectedStock && loading[selectedStock] ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonChart height={380} />
            <SkeletonCard height={100} />
            <SkeletonCard height={80} />
          </div>
        ) : selectedStock ? (
          <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center', color: C.textMuted }}>
            No technical data for {selectedStock} yet. Price history is still being fetched.
          </div>
        ) : null
      )}

      {/* Quick Scan Grid */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.textMuted }}>Quick Scan — All Stocks</h3>
          {alertCount > 0 && (
            <span style={{ fontSize: 10, color: C.amber, fontWeight: 600 }}>⚠ {alertCount} alert{alertCount > 1 ? 's' : ''}</span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {tickers.map(t => {
            const tech = techData[t];
            return (
              <QuickScanCard
                key={t}
                tech={tech}
                isSelected={compareMode ? compareTickers.includes(t) : selectedStock === t}
                onClick={() => compareMode ? handleCompareTickerToggle(t) : setSelectedStock(t)}
                isLoading={loading[t]}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
