import { useState, useEffect } from 'react';
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
          volume, avg_volume_30, volume_vs_avg, alerts, signal_factors } = data;

  const trendColor = trend.includes('Bull') ? C.green : trend.includes('Bear') ? C.red : C.amber;
  const rsiColor = rsi > 70 ? C.red : rsi < 30 ? C.green : C.amber;

  // Build the price axis range with some padding
  const allLevels = [
    ...(support || []),
    ...(resistance || []),
    price,
    sma50, sma200,
  ].filter(Boolean);
  const minPrice = Math.min(...allLevels) * 0.98;
  const maxPrice = Math.max(...allLevels) * 1.02;
  const priceRange = maxPrice - minPrice || 1;
  const toPos = (val) => ((val - minPrice) / priceRange) * 100;

  // Generate tick marks for the price axis
  const step = priceRange / 5;
  const axisTicks = [];
  for (let i = 0; i <= 5; i++) {
    axisTicks.push(minPrice + step * i);
  }

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
          {/* Sentiment reasoning */}
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

      {/* ─── Support & Resistance Price Strip ─── */}
      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>Support & Resistance Map</div>

        {/* Price axis labels along top */}
        <div style={{ position: 'relative', height: 16, marginBottom: 2 }}>
          {axisTicks.map((tick, i) => (
            <span key={i} style={{
              position: 'absolute', left: `${toPos(tick)}%`, transform: 'translateX(-50%)',
              fontSize: 9, color: C.textDim, fontFamily: MONO,
            }}>${tick.toFixed(0)}</span>
          ))}
        </div>

        {/* The price strip */}
        <div style={{ position: 'relative', height: 56, background: '#0d1424', borderRadius: 8, overflow: 'visible', border: `1px solid ${C.border}` }}>

          {/* Support levels */}
          {(support || []).map((s, i) => {
            const pos = toPos(s);
            return (
              <div key={`s${i}`} style={{ position: 'absolute', left: `${Math.min(Math.max(pos, 1), 99)}%`, top: 0, bottom: 0, width: 2, background: C.green, opacity: i === 0 ? 1 : 0.5, zIndex: 2 }}>
                <div style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: C.green, whiteSpace: 'nowrap', fontFamily: MONO, fontWeight: 600 }}>
                  ${s.toFixed(2)}
                </div>
              </div>
            );
          })}

          {/* Resistance levels */}
          {(resistance || []).map((r, i) => {
            const pos = toPos(r);
            return (
              <div key={`r${i}`} style={{ position: 'absolute', left: `${Math.min(Math.max(pos, 1), 99)}%`, top: 0, bottom: 0, width: 2, background: C.red, opacity: i === 0 ? 1 : 0.5, zIndex: 2 }}>
                <div style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: C.red, whiteSpace: 'nowrap', fontFamily: MONO, fontWeight: 600 }}>
                  ${r.toFixed(2)}
                </div>
              </div>
            );
          })}

          {/* SMA lines with price callouts */}
          {[{ val: sma50, label: '50d SMA', col: C.cyan }, { val: sma200, label: '200d SMA', col: C.pink }].map(sma => {
            if (!sma.val) return null;
            const pos = toPos(sma.val);
            if (pos < 0 || pos > 100) return null;
            return (
              <div key={sma.label} style={{ position: 'absolute', left: `${pos}%`, top: 0, bottom: 0, width: 1, borderLeft: `2px dashed ${sma.col}88`, zIndex: 3 }}>
                <div style={{ position: 'absolute', top: 2, left: 4, fontSize: 8, color: sma.col, whiteSpace: 'nowrap', fontWeight: 700, background: '#0d1424cc', padding: '1px 4px', borderRadius: 3 }}>
                  {sma.label} ${sma.val.toFixed(0)}
                </div>
              </div>
            );
          })}

          {/* Current price marker */}
          <div style={{
            position: 'absolute', left: `${Math.min(Math.max(toPos(price), 2), 98)}%`,
            top: 4, bottom: 4, width: 4, background: C.amber, borderRadius: 2, zIndex: 5,
            boxShadow: `0 0 10px ${C.amber}88`,
          }}>
            <div style={{
              position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
              fontSize: 11, color: '#0a0e17', whiteSpace: 'nowrap', fontWeight: 800, fontFamily: MONO,
              background: C.amber, padding: '1px 6px', borderRadius: 4,
            }}>${price.toFixed(2)}</div>
          </div>
        </div>

        {/* Price labels below for support/resistance */}
        <div style={{ height: 20 }} />

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, fontSize: 10, color: C.textMuted, marginTop: 4 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: C.green, borderRadius: 2, marginRight: 4 }} />Support</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: C.red, borderRadius: 2, marginRight: 4 }} />Resistance</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 4, background: C.amber, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />Current Price</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 0, borderTop: `2px dashed ${C.cyan}`, marginRight: 4, verticalAlign: 'middle' }} />50d SMA</span>
          <span><span style={{ display: 'inline-block', width: 12, height: 0, borderTop: `2px dashed ${C.pink}`, marginRight: 4, verticalAlign: 'middle' }} />200d SMA</span>
        </div>
      </div>

      {/* ─── RSI with zones and interpretation ─── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>RSI (14)</div>
        <div style={{ position: 'relative', height: 28, background: '#0d1424', borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {/* Zone backgrounds */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', background: C.green + '12' }} />
          <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: '40%', background: C.amber + '08' }} />
          <div style={{ position: 'absolute', left: '70%', top: 0, bottom: 0, width: '30%', background: C.red + '12' }} />

          {/* Zone labels */}
          <span style={{ position: 'absolute', left: '8%', top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: C.green + 'aa', fontWeight: 600 }}>Oversold</span>
          <span style={{ position: 'absolute', left: '44%', top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: C.textDim, fontWeight: 600 }}>Neutral</span>
          <span style={{ position: 'absolute', right: '5%', top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: C.red + 'aa', fontWeight: 600 }}>Overbought</span>

          {/* Zone dividers */}
          <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: 1, background: C.textDim + '33' }} />
          <div style={{ position: 'absolute', left: '70%', top: 0, bottom: 0, width: 1, background: C.textDim + '33' }} />

          {/* RSI needle */}
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
        {/* Plain-English interpretation */}
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

  // Count stocks with alerts
  const alertCount = Object.values(techData).filter(t => t.alerts && t.alerts.length > 0).length;

  return (
    <div>
      {showGuides && <GuidePanel guideKey="technicals" />}

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
        <TechnicalCard data={techData[selectedStock]} holding={holdings.find(h => h.ticker === selectedStock)} />
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
