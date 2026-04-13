import { useState, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { cardStyle, sectionTitle, labelStyle } from '../styles/shared';
import useMediaQuery, { useIsMobile } from '../hooks/useMediaQuery';

const MATERIAL_THRESHOLD = 1.0;

function StatCell({ label, value, subLabel, subColor }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '10px 14px',
      background: C.bg,
      borderRadius: 8,
      border: `1px solid ${C.border}`,
      minWidth: 0,
    }}>
      <span style={{ ...labelStyle, color: C.textDim, letterSpacing: 0.6 }}>
        {label}
      </span>
      <span style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: C.text }}>
        {value}
      </span>
      {subLabel && (
        <span style={{ fontSize: 10, fontWeight: 600, color: subColor || C.textDim, letterSpacing: 0.4 }}>
          {subLabel}
        </span>
      )}
    </div>
  );
}

export default function DriftAnalysis({ holdings = [], totalValue = 0, settings = {} }) {
  const isMobile = useIsMobile();
  const isNarrow = useMediaQuery('(max-width: 480px)');
  const [hoveredIdx, setHoveredIdx] = useState(null);

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

  const driftSorted = useMemo(() => {
    if (!holdings?.length || !totalValue) return [];
    return [...holdings]
      .map(h => {
        const actual = (h.market_value / totalValue) * 100;
        const drift = Number((actual - (h.target_allocation || 0)).toFixed(2));
        return { ...h, drift };
      })
      .filter(h => (h.target_allocation || 0) > 0)
      .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  }, [holdings, totalValue]);

  const maxAbsDrift = driftSorted[0] ? Math.abs(driftSorted[0].drift) : 1;
  const materialCount = driftSorted.filter(h => Math.abs(h.drift) >= MATERIAL_THRESHOLD).length;

  // Concentration stats — show "—" when portfolio has fewer than N holdings to avoid
  // mislabeling the cumulative of fewer positions (e.g. "Top 3" on a 2-holding portfolio).
  const largestPct = sorted[0]?.pct ?? 0;
  const top3Pct = sorted.length >= 3 ? sorted[2].cumulative : null;
  const top5Pct = sorted.length >= 5 ? sorted[4].cumulative : null;
  const top10Pct = sorted.length >= 10 ? sorted[9].cumulative : null;
  const hhi = sorted.length ? sorted.reduce((s, h) => s + h.pct * h.pct, 0) : 0;
  const hhiColor = hhi > 2500 ? C.red : hhi > 1500 ? C.amber : C.green;
  const hhiLabel = hhi > 2500 ? 'Concentrated' : hhi > 1500 ? 'Moderate' : 'Diversified';

  const fmtTopN = (v) => v == null ? '—' : `${v.toFixed(1)}%`;

  return (
    <div style={cardStyle}>
      {/* Header */}
      <h3 style={sectionTitle}>Drift Analysis</h3>

      {/* Concentration Summary — 2-col on narrow viewports, 5-col on desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isNarrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))',
        gap: 8,
        marginBottom: 18,
      }}>
        <StatCell label="Largest" value={`${largestPct.toFixed(1)}%`} />
        <StatCell label="Top 3" value={fmtTopN(top3Pct)} />
        <StatCell label="Top 5" value={fmtTopN(top5Pct)} />
        <StatCell label="Top 10" value={fmtTopN(top10Pct)} />
        <StatCell label="HHI" value={hhi.toFixed(0)} subLabel={hhiLabel} subColor={hhiColor} />
      </div>

      {/* Drift bar chart header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 11, color: C.textDim }}>
          Sorted by absolute drift
        </span>
        {materialCount > 0 && (
          <span style={{ fontSize: 10, fontFamily: MONO, color: C.amber, fontWeight: 600 }}>
            {materialCount} position{materialCount !== 1 ? 's' : ''} &gt;{MATERIAL_THRESHOLD}% drift
          </span>
        )}
      </div>

      {/* Drift bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {driftSorted.map((h, i) => {
          const drift = h.drift || 0;
          const absDrift = Math.abs(drift);
          const isMaterial = absDrift >= MATERIAL_THRESHOLD;
          const isHovered = hoveredIdx === i;
          const isOverweight = drift > 0;

          // Bar width as percentage of max drift
          const barWidth = (absDrift / maxAbsDrift) * 100;

          // Color: material drift gets accent, non-material stays dim
          const barColor = isMaterial
            ? (isOverweight ? C.red : C.green)
            : C.textDim;

          return (
            <div
              key={h.id || h.ticker}
              tabIndex={0}
              aria-label={`${h.ticker}: ${isOverweight ? 'overweight' : 'underweight'} ${absDrift.toFixed(1)}%, actual ${(h.actual_allocation || 0).toFixed(1)}%, target ${(h.target_allocation || 0).toFixed(1)}%`}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr 52px',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 6,
                cursor: 'default',
                transition: 'background 0.15s',
                background: isHovered ? `${C.border}88` : 'transparent',
                outline: 'none',
              }}
              onMouseEnter={isMobile ? undefined : () => setHoveredIdx(i)}
              onMouseLeave={isMobile ? undefined : () => setHoveredIdx(null)}
              onFocus={() => setHoveredIdx(i)}
              onBlur={() => setHoveredIdx(prev => prev === i ? null : prev)}
            >
              {/* Ticker */}
              <span style={{
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: isMaterial ? 600 : 400,
                color: (isMobile || isHovered) ? C.text : (isMaterial ? C.textMuted : C.textDim),
                transition: 'color 0.15s',
              }}>
                {h.ticker}
              </span>

              {/* Bi-directional bar centered */}
              <div style={{ position: 'relative', height: 20 }}>
                {/* Center line */}
                <div style={{
                  position: 'absolute',
                  top: 0, bottom: 0,
                  left: '50%',
                  width: 1,
                  background: `${C.border}`,
                }} />

                {/* Bar - grows from center */}
                <div style={{
                  position: 'absolute',
                  top: 2, bottom: 2,
                  ...(isOverweight
                    ? { left: '50%', width: `${barWidth / 2}%` }
                    : { right: '50%', width: `${barWidth / 2}%` }
                  ),
                  borderRadius: 3,
                  background: isHovered ? barColor : `${barColor}${isMaterial ? '88' : '44'}`,
                  transition: 'background 0.15s',
                }} />

                {/* Hover detail overlay */}
                {isHovered && (
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isOverweight ? 'flex-start' : 'flex-end',
                    padding: '0 8px',
                    fontSize: 10,
                    fontFamily: MONO,
                    color: C.text,
                    gap: 10,
                    pointerEvents: 'none',
                  }}>
                    <span>
                      Actual <span style={{ fontWeight: 600 }}>{(h.actual_allocation || 0).toFixed(1)}%</span>
                    </span>
                    <span style={{ color: C.textDim }}>vs</span>
                    <span>
                      Target <span style={{ fontWeight: 600 }}>{(h.target_allocation || 0).toFixed(1)}%</span>
                    </span>
                    {isMaterial && totalValue > 0 && (
                      <>
                        <span style={{ color: C.textDim }}>·</span>
                        <span style={{ color: isOverweight ? C.red : C.green, fontWeight: 600 }}>
                          {isOverweight ? 'Sell' : 'Buy'} ${Math.abs(drift * totalValue / 100).toFixed(0)}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Drift value */}
              <span style={{
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: isMaterial ? 700 : 400,
                color: isMaterial ? barColor : C.textDim,
                textAlign: 'right',
              }}>
                {drift > 0 ? '+' : ''}{drift.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Rebalance Actions */}
      {materialCount > 0 && totalValue > 0 && (() => {
        const monthly = parseFloat(settings?.monthly_contribution || '0');
        return (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Rebalance Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {driftSorted.filter(h => Math.abs(h.drift) >= MATERIAL_THRESHOLD).map(h => {
                const dollarAmt = Math.abs(h.drift * totalValue / 100);
                const isOver = h.drift > 0;
                const monthsLabel = monthly > 0 ? ` (${(dollarAmt / monthly).toFixed(1)} mo of contributions)` : '';
                return (
                  <div key={h.id || h.ticker} style={{ fontSize: 11, color: isOver ? C.red : C.green, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: MONO, fontWeight: 700, minWidth: 48, color: C.text }}>{h.ticker}</span>
                    <span>
                      {isOver ? 'Sell' : 'Buy'}{' '}
                      <span style={{ fontWeight: 700, fontFamily: MONO }}>${dollarAmt.toFixed(0)}</span>
                      <span style={{ color: C.textDim }}>{monthsLabel}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
