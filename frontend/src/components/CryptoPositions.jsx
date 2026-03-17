import { useState, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { displayCoin, fmtPrice, fmtK } from './CryptoView';

const CRYPTO_ACCENT = '#F7931A';
const LS_KEY = 'crypto_positions';

function loadPositionMeta() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

function savePositionMeta(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

export default function CryptoPositions({ holdings, totalCryptoValue, totalCryptoCost }) {
  const [expanded, setExpanded] = useState(null);
  const [meta, setMeta] = useState(loadPositionMeta);

  const totalPL = totalCryptoValue - totalCryptoCost;
  const totalPLPct = totalCryptoCost ? ((totalCryptoValue - totalCryptoCost) / totalCryptoCost) * 100 : 0;

  const updateMeta = (ticker, field, value) => {
    const next = { ...meta, [ticker]: { ...(meta[ticker] || {}), [field]: value } };
    setMeta(next);
    savePositionMeta(next);
  };

  return (
    <div>
      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <SummaryCard label="Total Invested" value={fmtK(totalCryptoCost)} color={C.textMuted} />
        <SummaryCard label="Current Value" value={fmtK(totalCryptoValue)} color={CRYPTO_ACCENT} />
        <SummaryCard label="Unrealized P&L" value={`${totalPL >= 0 ? '+' : ''}${fmtK(Math.abs(totalPL))}`} sub={`${totalPLPct >= 0 ? '+' : ''}${totalPLPct.toFixed(1)}%`} color={totalPL >= 0 ? C.green : C.red} />
        <SummaryCard label="Positions" value={holdings.length} color={C.text} />
      </div>

      {/* Position Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {holdings.map(h => {
          const coin = displayCoin(h.ticker);
          const gl = h.gain_loss || 0;
          const glPct = h.gain_loss_pct || 0;
          const positionPct = totalCryptoValue ? ((h.market_value / totalCryptoValue) * 100) : 0;
          const isExpanded = expanded === h.ticker;
          const posMeta = meta[h.ticker] || {};

          return (
            <div key={h.id} style={{
              background: C.card, borderRadius: 16,
              border: `1px solid ${gl >= 0 ? C.green : C.red}33`,
              overflow: 'hidden',
            }}>
              {/* Collapsed Header */}
              <div
                onClick={() => setExpanded(isExpanded ? null : h.ticker)}
                style={{
                  padding: '14px 18px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderLeft: `3px solid ${gl >= 0 ? C.green : C.red}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: CRYPTO_ACCENT + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: CRYPTO_ACCENT, fontFamily: MONO,
                  }}>
                    {coin.charAt(0)}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: MONO, fontSize: 14 }}>{coin}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>{h.shares} coins @ {fmtPrice(h.avg_cost || 0)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14 }}>{fmtK(h.market_value || 0)}</div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: gl >= 0 ? C.green : C.red }}>
                      {gl >= 0 ? '+' : ''}{fmtK(Math.abs(gl))} ({glPct >= 0 ? '+' : ''}{glPct.toFixed(1)}%)
                    </div>
                  </div>
                  <span style={{ color: C.textDim, fontSize: 12, transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                    &#9660;
                  </span>
                </div>
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
                  {/* Data Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginTop: 14 }}>
                    <DetailItem label="Current Price" value={fmtPrice(h.current_price || 0)} />
                    <DetailItem label="Avg Buy Price" value={fmtPrice(h.avg_cost || 0)} />
                    <DetailItem label="Total Invested" value={fmtK(h.cost_basis || 0)} />
                    <DetailItem label="Current Value" value={fmtK(h.market_value || 0)} />
                    <DetailItem label="Unrealized P&L" value={`${gl >= 0 ? '+' : ''}${fmtK(Math.abs(gl))}`} color={gl >= 0 ? C.green : C.red} />
                    <DetailItem label="P&L %" value={`${glPct >= 0 ? '+' : ''}${glPct.toFixed(1)}%`} color={glPct >= 0 ? C.green : C.red} />
                    <DetailItem label="Portfolio %" value={`${positionPct.toFixed(1)}%`} />
                    <DetailItem label="Day Change" value={`${(h.day_change_pct || 0) >= 0 ? '+' : ''}${(h.day_change_pct || 0).toFixed(1)}%`} color={(h.day_change_pct || 0) >= 0 ? C.green : C.red} />
                  </div>

                  {/* Entry Date */}
                  <div style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>Entry Date</label>
                    <input
                      type="date"
                      value={posMeta.entryDate || h.purchase_date || ''}
                      onChange={e => updateMeta(h.ticker, 'entryDate', e.target.value)}
                      style={{
                        display: 'block', marginTop: 4, padding: '6px 10px', fontSize: 12, fontFamily: MONO,
                        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
                        color: C.text, outline: 'none', width: 160,
                      }}
                    />
                  </div>

                  {/* Notes / Thesis */}
                  <div style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>Investment Thesis / Notes</label>
                    <textarea
                      value={posMeta.notes || ''}
                      onChange={e => updateMeta(h.ticker, 'notes', e.target.value)}
                      placeholder="Why did you buy this? What's your thesis..."
                      rows={3}
                      style={{
                        display: 'block', marginTop: 4, padding: '8px 10px', fontSize: 12,
                        background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
                        color: C.text, outline: 'none', width: '100%', resize: 'vertical',
                        fontFamily: 'inherit', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 14 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || C.text, fontFamily: MONO, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function DetailItem({ label, value, color }) {
  return (
    <div style={{ padding: '8px 10px', background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 9, color: C.textDim, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || C.text, fontFamily: MONO, marginTop: 2 }}>{value}</div>
    </div>
  );
}
