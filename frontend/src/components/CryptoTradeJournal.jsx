import { useState, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { displayCoin, fmtPrice } from './CryptoView';

const CRYPTO_ACCENT = '#F7931A';
const LS_KEY = 'crypto_trade_journal';

function loadTrades() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveTrades(trades) {
  localStorage.setItem(LS_KEY, JSON.stringify(trades));
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const RISK_COLORS = { low: C.green, medium: C.amber, high: C.red };

export default function CryptoTradeJournal({ holdings }) {
  const [trades, setTrades] = useState(loadTrades);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [filterCoin, setFilterCoin] = useState('all');
  const [filterAction, setFilterAction] = useState('all');

  // Form state
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], coin: holdings[0]?.ticker || '', action: 'buy', price: '', quantity: '', riskLevel: 'medium', reason: '', expectedScenario: '', exitPlan: '' });

  const persist = (next) => { setTrades(next); saveTrades(next); };

  const handleAdd = (e) => {
    e.preventDefault();
    const trade = {
      id: genId(),
      ...form,
      price: parseFloat(form.price),
      quantity: parseFloat(form.quantity),
      total: parseFloat(form.price) * parseFloat(form.quantity),
      status: 'open',
      reviewThesisCorrect: null,
      reviewOutcome: null,
      reviewMissed: '',
      reviewLessons: '',
      closedDate: null,
      closedPrice: null,
    };
    persist([trade, ...trades]);
    setShowForm(false);
    setForm({ date: new Date().toISOString().split('T')[0], coin: holdings[0]?.ticker || '', action: 'buy', price: '', quantity: '', riskLevel: 'medium', reason: '', expectedScenario: '', exitPlan: '' });
  };

  const closeTrade = (id, closedPrice) => {
    persist(trades.map(t => t.id === id ? { ...t, status: 'closed', closedDate: new Date().toISOString().split('T')[0], closedPrice: parseFloat(closedPrice) } : t));
  };

  const updateReview = (id, field, value) => {
    persist(trades.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const deleteTrade = (id) => {
    persist(trades.filter(t => t.id !== id));
  };

  const filtered = useMemo(() => {
    let result = trades;
    if (filterCoin !== 'all') result = result.filter(t => t.coin === filterCoin);
    if (filterAction !== 'all') result = result.filter(t => t.action === filterAction);
    return result;
  }, [trades, filterCoin, filterAction]);

  // Stats
  const closedTrades = trades.filter(t => t.status === 'closed');
  const wins = closedTrades.filter(t => {
    if (t.action === 'buy') return (t.closedPrice || 0) > t.price;
    return (t.closedPrice || 0) < t.price;
  });
  const winRate = closedTrades.length ? ((wins.length / closedTrades.length) * 100).toFixed(0) : '0';

  const exportCSV = () => {
    const headers = ['Date', 'Coin', 'Action', 'Price', 'Qty', 'Total', 'Risk', 'Status', 'Reason', 'Exit Plan'];
    const rows = trades.map(t => [t.date, displayCoin(t.coin), t.action, t.price, t.quantity, t.total?.toFixed(2), t.riskLevel, t.status, `"${(t.reason || '').replace(/"/g, '""')}"`, `"${(t.exitPlan || '').replace(/"/g, '""')}"`]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'crypto_trade_journal.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', fontSize: 12, fontFamily: MONO,
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div>
      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
        <StatCard label="Total Trades" value={trades.length} color={CRYPTO_ACCENT} />
        <StatCard label="Open" value={trades.filter(t => t.status === 'open').length} color={C.amber} />
        <StatCard label="Closed" value={closedTrades.length} color={C.textMuted} />
        <StatCard label="Win Rate" value={`${winRate}%`} color={parseInt(winRate) >= 50 ? C.green : C.red} />
      </div>

      {/* Action Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', background: CRYPTO_ACCENT, color: '#fff',
        }}>
          {showForm ? 'Cancel' : '+ New Trade'}
        </button>

        <select value={filterCoin} onChange={e => setFilterCoin(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
          <option value="all">All Coins</option>
          {holdings.map(h => <option key={h.id} value={h.ticker}>{displayCoin(h.ticker)}</option>)}
        </select>

        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '6px 10px' }}>
          <option value="all">All Actions</option>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </select>

        {trades.length > 0 && (
          <button onClick={exportCSV} style={{
            padding: '10px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: C.textMuted, minHeight: 44,
          }}>
            Export CSV
          </button>
        )}
      </div>

      {/* New Trade Form */}
      {showForm && (
        <form onSubmit={handleAdd} style={{ background: C.card, borderRadius: 16, border: `1px solid ${CRYPTO_ACCENT}33`, padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 700, color: CRYPTO_ACCENT }}>Log New Trade</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Coin</label>
              <select value={form.coin} onChange={e => setForm({ ...form, coin: e.target.value })} required style={inputStyle}>
                {holdings.map(h => <option key={h.id} value={h.ticker}>{displayCoin(h.ticker)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Action</label>
              <select value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} style={inputStyle}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Price at Entry</label>
              <input type="number" step="any" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required placeholder="0.00" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Quantity</label>
              <input type="number" step="any" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Risk Level</label>
              <select value={form.riskLevel} onChange={e => setForm({ ...form, riskLevel: e.target.value })} style={inputStyle}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Reason for Entry *</label>
              <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required placeholder="Why are you making this trade?" rows={2} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Exit Plan</label>
              <textarea value={form.exitPlan} onChange={e => setForm({ ...form, exitPlan: e.target.value })} placeholder="Stop loss, take profit levels..." rows={2} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: C.textDim, fontWeight: 600 }}>Expected Scenario</label>
            <input value={form.expectedScenario} onChange={e => setForm({ ...form, expectedScenario: e.target.value })} placeholder="e.g. XRP breaks $2, target $3" style={inputStyle} />
          </div>
          <button type="submit" style={{
            padding: '8px 20px', background: CRYPTO_ACCENT, color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            Log Trade
          </button>
        </form>
      )}

      {/* Trade List */}
      {filtered.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: C.textMuted, fontWeight: 600, marginBottom: 8 }}>No trades logged yet</div>
          <div style={{ fontSize: 12, color: C.textDim }}>Click "+ New Trade" to start your journal. Tracking every trade builds discipline.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(t => {
            const isExp = expanded === t.id;
            const pnl = t.status === 'closed' && t.closedPrice != null
              ? (t.action === 'buy' ? (t.closedPrice - t.price) * t.quantity : (t.price - t.closedPrice) * t.quantity)
              : null;
            const statusColor = t.status === 'closed' ? (pnl != null && pnl >= 0 ? C.green : C.red) : C.amber;

            return (
              <div key={t.id} style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                {/* Row */}
                <div
                  onClick={() => setExpanded(isExp ? null : t.id)}
                  style={{
                    padding: '10px 16px', cursor: 'pointer',
                    display: 'grid', gridTemplateColumns: '80px 60px 50px 80px 60px 80px 60px 60px 1fr',
                    gap: 8, alignItems: 'center', fontSize: 12,
                    borderLeft: `3px solid ${statusColor}`,
                  }}
                >
                  <span style={{ fontFamily: MONO, color: C.textMuted }}>{t.date}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 700 }}>{displayCoin(t.coin)}</span>
                  <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 10, color: t.action === 'buy' ? C.green : C.red }}>{t.action}</span>
                  <span style={{ fontFamily: MONO }}>{fmtPrice(t.price)}</span>
                  <span style={{ fontFamily: MONO, color: C.textMuted }}>{t.quantity}</span>
                  <span style={{ fontFamily: MONO }}>${t.total?.toFixed(2)}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: RISK_COLORS[t.riskLevel] || C.textMuted, textTransform: 'uppercase' }}>{t.riskLevel}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                    background: statusColor + '22', color: statusColor,
                  }}>
                    {t.status}
                  </span>
                  <span style={{ fontSize: 11, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.reason}</span>
                </div>

                {/* Expanded Detail */}
                {isExp && (
                  <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Reason for Entry</div>
                        <div style={{ fontSize: 12, color: C.text }}>{t.reason || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Exit Plan</div>
                        <div style={{ fontSize: 12, color: C.text }}>{t.exitPlan || '-'}</div>
                      </div>
                    </div>
                    {t.expectedScenario && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Expected Scenario</div>
                        <div style={{ fontSize: 12, color: C.text }}>{t.expectedScenario}</div>
                      </div>
                    )}

                    {/* Close Trade (if open) */}
                    {t.status === 'open' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: '8px 10px', background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Close at:</span>
                        <input
                          type="number" step="any" placeholder="Exit price"
                          id={`close-${t.id}`}
                          style={{ padding: '4px 8px', fontSize: 12, fontFamily: MONO, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, outline: 'none', width: 100 }}
                        />
                        <button onClick={() => {
                          const val = document.getElementById(`close-${t.id}`).value;
                          if (val) closeTrade(t.id, val);
                        }} style={{ padding: '10px 14px', minHeight: 44, background: C.amber, color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          Close Trade
                        </button>
                      </div>
                    )}

                    {/* P&L for closed trades */}
                    {t.status === 'closed' && (
                      <div style={{ marginBottom: 12, padding: '8px 10px', background: C.card, borderRadius: 6, border: `1px solid ${pnl >= 0 ? C.green : C.red}33` }}>
                        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                          <span style={{ color: C.textMuted }}>Closed at: <span style={{ color: C.text, fontFamily: MONO }}>{fmtPrice(t.closedPrice)}</span></span>
                          <span style={{ color: C.textMuted }}>P&L: <span style={{ color: pnl >= 0 ? C.green : C.red, fontFamily: MONO, fontWeight: 700 }}>{pnl >= 0 ? '+' : ''}${pnl?.toFixed(2)}</span></span>
                        </div>
                      </div>
                    )}

                    {/* Post-Trade Review (closed trades only) */}
                    {t.status === 'closed' && (
                      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                        <div style={{ fontSize: 11, color: CRYPTO_ACCENT, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Post-Trade Review</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
                          <div>
                            <label style={{ fontSize: 10, color: C.textDim }}>Was thesis correct?</label>
                            <select value={t.reviewThesisCorrect || ''} onChange={e => updateReview(t.id, 'reviewThesisCorrect', e.target.value)} style={{ ...inputStyle, padding: '4px 8px' }}>
                              <option value="">-</option>
                              <option value="yes">Yes</option>
                              <option value="partially">Partially</option>
                              <option value="no">No</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 10, color: C.textDim }}>Outcome</label>
                            <select value={t.reviewOutcome || ''} onChange={e => updateReview(t.id, 'reviewOutcome', e.target.value)} style={{ ...inputStyle, padding: '4px 8px' }}>
                              <option value="">-</option>
                              <option value="won">Won</option>
                              <option value="lost">Lost</option>
                              <option value="neutral">Neutral</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 10, color: C.textDim }}>What did I miss?</label>
                            <textarea value={t.reviewMissed || ''} onChange={e => updateReview(t.id, 'reviewMissed', e.target.value)} rows={2} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, color: C.textDim }}>Lessons learned</label>
                            <textarea value={t.reviewLessons || ''} onChange={e => updateReview(t.id, 'reviewLessons', e.target.value)} rows={2} style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Delete */}
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <button onClick={() => deleteTrade(t.id)} style={{
                        padding: '10px 14px', minHeight: 44, background: 'transparent', border: `1px solid ${C.red}44`,
                        color: C.red, borderRadius: 4, fontSize: 12, cursor: 'pointer',
                      }}>
                        Delete Trade
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 14 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || C.text, fontFamily: MONO, marginTop: 4 }}>{value}</div>
    </div>
  );
}
