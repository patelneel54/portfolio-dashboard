import { C, TYPE_COLORS, MONO, ASSET_CLASS_LABELS } from '../styles/theme';
import { cardStyle, badge as badgeStyle, labelStyle, srOnly } from '../styles/shared';

const ACCOUNT_BADGE = {
  brokerage: { color: C.blue, label: 'Brokerage' },
  '401k': { color: C.purple, label: '401k' },
  crypto: { color: '#F7931A', label: 'Crypto' },
};

export default function HoldingCard({ holding: h, isExpanded, onToggle, showTargetDrift, isAllAccounts }) {
  const glPct = h.gain_loss_pct || 0;
  const glPositive = glPct >= 0;
  const acct = h.account_type || 'brokerage';
  const badge = ACCOUNT_BADGE[acct] || ACCOUNT_BADGE.brokerage;
  const hIsBrokerage = acct === 'brokerage';

  return (
    <div style={{
      ...cardStyle, padding: 0,
      borderLeft: isExpanded ? `3px solid ${C.accent}` : `1px solid ${C.border}`,
      overflow: 'hidden',
    }}>
      {/* Collapsed header — always visible */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={onToggle}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          cursor: 'pointer',
          minHeight: 44,
        }}
      >
        {/* Left: Ticker + account badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14, color: C.text }}>{h.is_manual && h.manual_name ? h.manual_name : h.ticker}</span>
          <span style={badgeStyle(badge.color)}>
            {acct}
          </span>
          <span style={{ color: TYPE_COLORS[h.type], fontSize: 10, fontWeight: 600 }}>{h.type}</span>
        </div>

        {/* Right: Value + G/L % badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>
            ${(h.market_value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 11, fontWeight: 600,
            padding: '2px 8px', borderRadius: 10,
            background: glPositive ? C.greenBg : C.redBg,
            color: glPositive ? C.green : C.red,
          }}>
            <span style={srOnly}>{glPositive ? 'gain ' : 'loss '}</span>
            {glPositive ? '+' : ''}{glPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Expanded details — animated reveal */}
      <div style={{
        maxHeight: isExpanded ? 300 : 0,
        overflow: 'hidden',
        transition: 'max-height 150ms ease',
      }}>
        <div style={{
          padding: '0 14px 14px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px 16px',
        }}>
          <Detail label="Shares" value={h.shares} />
          <Detail label="Avg Cost" value={`$${(h.avg_cost || 0).toFixed(2)}`} />
          <Detail label="Current Price" value={`$${(h.current_price || h.avg_cost || 0).toFixed(2)}`} />
          <Detail label="G/L $" value={<><span style={srOnly}>{(h.gain_loss || 0) >= 0 ? 'gain ' : 'loss '}</span>{`${(h.gain_loss || 0) >= 0 ? '+' : ''}$${(h.gain_loss || 0).toFixed(0)}`}</>} color={(h.gain_loss || 0) >= 0 ? C.green : C.red} />
          <Detail label="Actual %" value={`${(h.actual_allocation || 0).toFixed(1)}%`} />
          <Detail label="Account" value={badge.label} />
          {h.asset_class && <Detail label="Asset Class" value={ASSET_CLASS_LABELS[h.asset_class] || h.asset_class} />}
          {h.is_manual && h.benchmark_ticker && <Detail label="Benchmark" value={h.benchmark_ticker} />}
          {showTargetDrift && (isAllAccounts ? hIsBrokerage : true) && (
            <>
              <Detail label="Target %" value={`${(h.target_allocation || 0).toFixed(1)}%`} />
              <Detail
                label="Drift"
                value={<><span style={srOnly}>{(h.drift || 0) > 0 ? 'overweight ' : 'underweight '}</span>{`${(h.drift || 0) > 0 ? '+' : ''}${(h.drift || 0).toFixed(1)}%`}</>}
                color={Math.abs(h.drift || 0) < 0.5 ? C.textDim : (h.drift || 0) > 0 ? C.red : C.green}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, color }) {
  return (
    <div>
      <div style={{ ...labelStyle, letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: color || C.text }}>{value}</div>
    </div>
  );
}
