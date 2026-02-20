import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import GuidePanel from './GuidePanel';

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

/* ── Price History Chart (replaces the old S/R strip) ── */
const PriceHistoryChart = ({ data, support, resistance, sma50, sma200, price }) => {
  if (!data || data.length === 0) return null;

  const allLevels = [
    ...data.map(d => d.close),
    ...(support || []).slice(0, 2),
    ...(resistance || []).slice(0, 2),
    sma50, sma200,
  ].filter(Boolean);
  const minY = Math.min(...allLevels) * 0.97;
  const maxY = Math.max(...allLevels) * 1.03;

  const fmtDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ marginTop: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
        Price vs Key Levels (60 days)
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity={0.15} />
              <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
          <XAxis
            dataKey="date"
            tick={{ fill: C.textDim, fontSize: 9 }}
            tickFormatter={fmtDate}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minY, maxY]}
            tick={{ fill: C.textDim, fontSize: 9, fontFamily: MONO }}
            tickFormatter={v => `$${v.toFixed(0)}`}
            width={52}
          />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div style={{ background: '#1e293b', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11 }}>
                <div style={{ color: C.textDim, marginBottom: 2 }}>{fmtDate(label)}</div>
                <div style={{ color: C.text, fontWeight: 700, fontFamily: MONO }}>${payload[0].value.toFixed(2)}</div>
              </div>
            );
          }} />

          {/* Support lines */}
          {(support || []).slice(0, 2).map((s, i) => (
            <ReferenceLine key={`s${i}`} y={s} stroke={C.green} strokeDasharray={i === 0 ? "0" : "4 4"} strokeWidth={i === 0 ? 1.5 : 1} strokeOpacity={i === 0 ? 0.8 : 0.4}
              label={{ value: `S $${s.toFixed(0)}`, position: 'insideLeft', fill: C.green, fontSize: 9 }} />
          ))}

          {/* Resistance lines */}
          {(resistance || []).slice(0, 2).map((r, i) => (
            <ReferenceLine key={`r${i}`} y={r} stroke={C.red} strokeDasharray={i === 0 ? "0" : "4 4"} strokeWidth={i === 0 ? 1.5 : 1} strokeOpacity={i === 0 ? 0.8 : 0.4}
              label={{ value: `R $${r.toFixed(0)}`, position: 'insideLeft', fill: C.red, fontSize: 9 }} />
          ))}

          {/* SMA50 */}
          {sma50 && (
            <ReferenceLine y={sma50} stroke={C.cyan} strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `50d $${sma50.toFixed(0)}`, position: 'insideRight', fill: C.cyan, fontSize: 9 }} />
          )}

          {/* SMA200 */}
          {sma200 && (
            <ReferenceLine y={sma200} stroke={C.pink} strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `200d $${sma200.toFixed(0)}`, position: 'insideRight', fill: C.pink, fontSize: 9 }} />
          )}

          {/* Current price */}
          <ReferenceLine y={price} stroke={C.amber} strokeWidth={2}
            label={{ value: `$${price.toFixed(2)}`, position: 'right', fill: C.amber, fontSize: 10, fontWeight: 700 }} />

          <Area type="monotone" dataKey="close" stroke={C.accent} strokeWidth={2} fill="url(#priceGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, fontSize: 9, color: C.textMuted, marginTop: 6, flexWrap: 'wrap' }}>
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
    return <div style={{ marginTop: 16, fontSize: 11, color: C.textDim }}>Loading news for {ticker}...</div>;
  }
  if (!articles || articles.length === 0) return null;

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginTop: 12 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Recent News</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {articles.slice(0, 5).map((a, i) => {
          const hoursAgo = a.published_at
            ? Math.round((Date.now() / 1000 - a.published_at) / 3600)
            : null;
          return (
            <a key={i} href={a.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <div style={{
                padding: '8px 12px', background: '#0d1424', borderRadius: 6,
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
  if (isLoading) return <div style={{ marginTop: 12, fontSize: 11, color: C.textDim }}>Loading valuation data...</div>;
  if (!data) return null;

  const metrics = [
    { label: 'Trailing P/E', value: data.trailing_pe != null ? data.trailing_pe.toFixed(1) : '—' },
    { label: 'Forward P/E', value: data.forward_pe != null ? data.forward_pe.toFixed(1) : '—' },
    { label: 'EPS Growth', value: data.earnings_growth != null ? `${(data.earnings_growth * 100).toFixed(1)}%` : '—' },
    { label: 'Div Yield', value: data.dividend_yield != null ? `${(data.dividend_yield * 100).toFixed(2)}%` : '—' },
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
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginTop: 12 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>
        Valuation{data.sector ? ` — ${data.sector}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: '#0d1424', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}` }}>
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
  const allAlerts = Object.entries(techData)
    .flatMap(([ticker, t]) => (t.alerts || []).map(a => ({ ticker, alert: a })))
    .filter(a => a.alert);

  if (allAlerts.length === 0) return null;

  const alertColor = (alert) => {
    if (alert.includes('oversold') || alert.includes('support')) return C.green;
    if (alert.includes('overbought') || alert.includes('resistance') || alert.includes('Death')) return C.red;
    if (alert.includes('Golden')) return C.cyan;
    return C.amber;
  };

  return (
    <div style={{
      background: C.card, borderRadius: 12, border: `1px solid ${C.amber}33`,
      padding: 16, marginBottom: 16,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 10 }}>
        Active Alerts ({allAlerts.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {allAlerts.map((item, i) => {
          const col = alertColor(item.alert);
          return (
            <div key={i} onClick={() => onSelectStock(item.ticker)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px', borderRadius: 6, background: col + '0d',
              border: `1px solid ${col}22`, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = col + '1a'}
              onMouseLeave={e => e.currentTarget.style.background = col + '0d'}
            >
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.text, minWidth: 48 }}>{item.ticker}</span>
              <span style={{ fontSize: 11, color: col }}>{item.alert}</span>
            </div>
          );
        })}
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
    <div style={{ background: '#0d1424', borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${C.border}` }}>
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

const TechnicalCard = ({ data, holding }) => {
  if (!data) return null;
  const { ticker, price, rsi, sma50, sma200, support, resistance, trend, note,
          volume, avg_volume_30, volume_vs_avg, alerts, signal_factors,
          price_history_60d, actionable_summary } = data;

  const trendColor = trend.includes('Bull') ? C.green : trend.includes('Bear') ? C.red : C.amber;
  const rsiColor = rsi > 70 ? C.red : rsi < 30 ? C.green : C.amber;

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24, marginBottom: 12 }}>
      {/* Header: Ticker, Price, Trend + Reasoning */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: MONO }}>{ticker}</span>
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
          marginTop: 12, padding: '10px 14px', background: '#0d1424', borderRadius: 6,
          fontSize: 12, color: C.text, lineHeight: 1.6,
          borderLeft: `3px solid ${trendColor}`, fontWeight: 500,
        }}>
          {actionable_summary}
        </div>
      )}

      {/* ─── Price History Chart ─── */}
      <PriceHistoryChart
        data={price_history_60d}
        support={support}
        resistance={resistance}
        sma50={sma50}
        sma200={sma200}
        price={price}
      />

      {/* ─── RSI with zones and interpretation ─── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>RSI (14)</div>
        <div style={{ position: 'relative', height: 28, background: '#0d1424', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', background: C.green + '12' }} />
          <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: '40%', background: C.amber + '08' }} />
          <div style={{ position: 'absolute', left: '70%', top: 0, bottom: 0, width: '30%', background: C.red + '12' }} />
          <span style={{ position: 'absolute', left: '8%', top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: C.green + 'aa', fontWeight: 600 }}>Oversold</span>
          <span style={{ position: 'absolute', left: '44%', top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: C.textDim, fontWeight: 600 }}>Neutral</span>
          <span style={{ position: 'absolute', right: '5%', top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: C.red + 'aa', fontWeight: 600 }}>Overbought</span>
          <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: 1, background: C.textDim + '33' }} />
          <div style={{ position: 'absolute', left: '70%', top: 0, bottom: 0, width: 1, background: C.textDim + '33' }} />
          <div style={{
            position: 'absolute', left: `${Math.min(Math.max(rsi, 2), 98)}%`,
            top: 2, bottom: 2, width: 3, background: rsiColor, borderRadius: 2, zIndex: 5,
            boxShadow: `0 0 6px ${rsiColor}66`,
            transform: 'translateX(-50%)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>0</span>
          <span style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>30</span>
          <span style={{
            fontSize: 13, fontWeight: 800, color: rsiColor, fontFamily: MONO,
            background: rsiColor + '15', padding: '2px 10px', borderRadius: 4,
          }}>RSI {rsi.toFixed(0)}</span>
          <span style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>70</span>
          <span style={{ fontSize: 9, color: C.textDim, fontFamily: MONO }}>100</span>
        </div>
        <div style={{
          marginTop: 6, fontSize: 11, color: C.textMuted, fontStyle: 'italic',
          padding: '4px 8px', background: rsiColor + '08', borderRadius: 4, borderLeft: `3px solid ${rsiColor}44`,
        }}>
          RSI at {rsi.toFixed(0)} — {rsiInterpretation(rsi)}
        </div>
      </div>

      {/* ─── Key Levels ─── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Key Levels</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {sma50 && (
            <div style={{ background: '#0d1424', padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 9, color: C.cyan, fontWeight: 600, marginBottom: 2 }}>50d SMA</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.text }}>${sma50.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: price > sma50 ? C.green : C.red, marginTop: 2 }}>
                Price is {price > sma50 ? 'above' : 'below'} ({((price - sma50) / sma50 * 100).toFixed(1)}%)
              </div>
            </div>
          )}
          {sma200 && (
            <div style={{ background: '#0d1424', padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 9, color: C.pink, fontWeight: 600, marginBottom: 2 }}>200d SMA</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.text }}>${sma200.toFixed(2)}</div>
              <div style={{ fontSize: 10, color: price > sma200 ? C.green : C.red, marginTop: 2 }}>
                Price is {price > sma200 ? 'above' : 'below'} ({((price - sma200) / sma200 * 100).toFixed(1)}%)
              </div>
            </div>
          )}
          {support?.[0] && (
            <div style={{ background: '#0d1424', padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 9, color: C.green, fontWeight: 600, marginBottom: 2 }}>Nearest Support</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.text }}>${support[0].toFixed(2)}</div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                {((price - support[0]) / support[0] * 100).toFixed(1)}% above
              </div>
            </div>
          )}
          {resistance?.[0] && (
            <div style={{ background: '#0d1424', padding: '8px 12px', borderRadius: 6, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 9, color: C.red, fontWeight: 600, marginBottom: 2 }}>Nearest Resistance</div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, color: C.text }}>${resistance[0].toFixed(2)}</div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
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
        <div style={{ marginTop: 16, padding: '10px 14px', background: '#0d1424', borderRadius: 6, fontSize: 12, color: C.textMuted, lineHeight: 1.6, borderLeft: `3px solid ${trendColor}` }}>
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
    <div style={{ padding: '10px 14px', background: '#0d1424', borderRadius: 8, border: `1px solid ${C.border}` }}>
      <span style={{ fontWeight: 700, fontSize: 13, fontFamily: MONO }}>{isLoading ? '' : ''}</span>
      <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{isLoading ? 'Loading...' : 'No data'}</div>
    </div>
  );

  const trendCol = tech.trend.includes('Bull') ? C.green : tech.trend.includes('Bear') ? C.red : C.amber;
  const rsiCol = tech.rsi > 70 ? C.red : tech.rsi < 30 ? C.green : C.textMuted;
  const hasAlerts = tech.alerts && tech.alerts.length > 0;

  return (
    <div onClick={onClick} style={{
      padding: '10px 14px', background: '#0d1424', borderRadius: 8, cursor: 'pointer',
      border: `1px solid ${isSelected ? C.accent + '66' : hasAlerts ? C.amber + '44' : C.border}`,
      transition: 'all 0.2s',
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

/* ══════════════════════════════════════════════════════════════════════
   TechnicalsTab — main export
   ══════════════════════════════════════════════════════════════════════ */
export default function TechnicalsTab({ holdings, showGuides }) {
  const [selectedStock, setSelectedStock] = useState(null);
  const [techData, setTechData] = useState({});
  const [loading, setLoading] = useState({});
  const [newsData, setNewsData] = useState({});
  const [newsLoading, setNewsLoading] = useState({});
  const [fundamentals, setFundamentals] = useState({});
  const [fundLoading, setFundLoading] = useState({});

  const tickers = holdings.filter(h => h.type === 'Stock').map(h => h.ticker);

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

  return (
    <div>
      {showGuides && <GuidePanel guideKey="technicals" />}

      {/* Alerts Summary Panel */}
      <AlertsSummary techData={techData} onSelectStock={setSelectedStock} />

      {/* Stock Selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {tickers.map(t => {
          const hasAlert = techData[t]?.alerts?.length > 0;
          return (
            <button
              key={t}
              onClick={() => setSelectedStock(t)}
              style={{
                padding: '6px 14px', borderRadius: 8,
                border: `1px solid ${selectedStock === t ? C.accent : hasAlert ? C.amber + '66' : C.border}`,
                background: selectedStock === t ? C.accent + '22' : C.card,
                color: selectedStock === t ? C.accent : C.textMuted,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO,
                position: 'relative',
              }}
            >
              {hasAlert && (
                <span style={{
                  position: 'absolute', top: -3, right: -3, width: 8, height: 8,
                  background: C.amber, borderRadius: '50%', border: `2px solid ${C.card}`,
                }} />
              )}
              {t}
            </button>
          );
        })}
        {alertCount > 0 && (
          <span style={{ fontSize: 10, color: C.amber, marginLeft: 8 }}>
            ⚠ {alertCount} stock{alertCount > 1 ? 's' : ''} with alerts
          </span>
        )}
      </div>

      {/* Selected Stock Detail */}
      {selectedStock && techData[selectedStock] ? (
        <>
          <TechnicalCard data={techData[selectedStock]} holding={holdings.find(h => h.ticker === selectedStock)} />
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
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center', color: C.textMuted }}>
          Loading technicals for {selectedStock}...
        </div>
      ) : selectedStock ? (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center', color: C.textMuted }}>
          No technical data for {selectedStock} yet. Price history is still being fetched.
        </div>
      ) : null}

      {/* Quick Scan Grid */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>Quick Scan — All Stocks</h3>
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
                isSelected={selectedStock === t}
                onClick={() => setSelectedStock(t)}
                isLoading={loading[t]}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
