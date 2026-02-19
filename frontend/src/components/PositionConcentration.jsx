import { useState, useMemo } from 'react';
import { C, MONO } from '../styles/theme';

const BAR_COLORS = {
  ETF: { bar: '#4f46e5', barBg: '#4f46e520' },
  Stock: { bar: '#8b5cf6', barBg: '#8b5cf620' },
};

const THRESHOLD_LINES = [50, 80];

export default function PositionConcentration({ holdings = [], totalValue = 0 }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    if (!holdings?.length || !totalValue) return [];
    return [...holdings]
      .sort((a, b) => b.market_value - a.market_value)
      .map((h, i, arr) => {
        const pct = (h.market_value / totalValue) * 100;
        const cumulative = arr.slice(0, i + 1).reduce((s, x) => s + (x.market_value / totalValue) * 100, 0);
        return { ...h, pct, cumulative };
      });
  }, [holdings, totalValue]);

  const maxPct = sorted[0]?.pct || 1;
  const VISIBLE_COUNT = 12;
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE_COUNT);
  const hasMore = sorted.length > VISIBLE_COUNT;

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>Position Concentration</h3>
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: C.textDim }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: BAR_COLORS.ETF.bar }} />
            ETF
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: BAR_COLORS.Stock.bar }} />
            Stock
          </span>
        </div>
      </div>

      {/* Bar chart */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visible.map((h, i) => {
          const colors = BAR_COLORS[h.type] || BAR_COLORS.ETF;
          const isHovered = hoveredIdx === i;
          const barWidth = (h.pct / maxPct) * 100;

          // Find threshold crossings for cumulative markers
          const prevCum = i > 0 ? visible[i - 1].cumulative : 0;
          const crossedThreshold = THRESHOLD_LINES.find(t => prevCum < t && h.cumulative >= t);

          return (
            <div key={h.ticker}>
              {crossedThreshold && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', marginBottom: 2,
                }}>
                  <div style={{ flex: 1, height: 1, background: `${C.accent}40` }} />
                  <span style={{ fontSize: 10, color: C.accent, fontWeight: 600, fontFamily: MONO, whiteSpace: 'nowrap' }}>
                    {crossedThreshold}% cumulative
                  </span>
                  <div style={{ flex: 1, height: 1, background: `${C.accent}40` }} />
                </div>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 46px 1fr',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 8px',
                  borderRadius: 6,
                  cursor: 'default',
                  transition: 'background 0.15s',
                  background: isHovered ? `${C.border}88` : 'transparent',
                }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Ticker */}
                <span style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 600,
                  color: isHovered ? C.text : C.textMuted,
                  transition: 'color 0.15s',
                }}>
                  {h.ticker}
                </span>

                {/* Percentage */}
                <span style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: C.textDim,
                  textAlign: 'right',
                }}>
                  {h.pct.toFixed(1)}%
                </span>

                {/* Bar + hover detail */}
                <div style={{ position: 'relative', height: 22 }}>
                  {/* Background track */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 4,
                    background: colors.barBg,
                  }} />
                  {/* Filled bar */}
                  <div style={{
                    position: 'absolute',
                    top: 0, left: 0, bottom: 0,
                    width: `${barWidth}%`,
                    borderRadius: 4,
                    background: isHovered
                      ? colors.bar
                      : `${colors.bar}99`,
                    transition: 'background 0.15s, width 0.4s ease',
                  }} />

                  {/* Hover tooltip overlay */}
                  {isHovered && (
                    <div style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0, bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      paddingRight: 10,
                      fontSize: 10,
                      fontFamily: MONO,
                      color: C.text,
                      gap: 12,
                      pointerEvents: 'none',
                    }}>
                      <span>${h.market_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                      <span style={{ color: (h.gain_loss_pct || 0) >= 0 ? C.green : C.red }}>
                        {(h.gain_loss_pct || 0) >= 0 ? '+' : ''}{(h.gain_loss_pct || 0).toFixed(1)}%
                      </span>
                      {h.drift != null && Math.abs(h.drift) >= 0.3 && (
                        <span style={{ color: C.amber }}>
                          drift {h.drift > 0 ? '+' : ''}{h.drift.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {hasMore && (
        <button
          onClick={() => setShowAll(v => !v)}
          style={{
            display: 'block',
            margin: '12px auto 0',
            background: 'none',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '6px 16px',
            fontSize: 11,
            color: C.textMuted,
            cursor: 'pointer',
            fontFamily: MONO,
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.target.style.color = C.text; e.target.style.borderColor = C.textDim; }}
          onMouseLeave={e => { e.target.style.color = C.textMuted; e.target.style.borderColor = C.border; }}
        >
          {showAll ? `Show top ${VISIBLE_COUNT}` : `Show all ${sorted.length} positions`}
        </button>
      )}
    </div>
  );
}
