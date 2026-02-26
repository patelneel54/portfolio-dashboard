import { useState } from 'react';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';

const ACCOUNT_TABS = [
  { id: 'brokerage', label: 'Brokerage', color: C.blue },
  { id: '401k', label: '401k', color: C.purple },
  { id: 'crypto', label: 'Crypto', color: '#F7931A' },
];

export default function ManageHoldings({ holdings, onClose, onUpdate, accountFilter }) {
  const initialTab = accountFilter === 'all' ? 'brokerage' : accountFilter || 'brokerage';
  const [activeAccount, setActiveAccount] = useState(initialTab);
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [target, setTarget] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [deleting, setDeleting] = useState(null);

  const isBrokerage = activeAccount === 'brokerage';
  const isCrypto = activeAccount === 'crypto';

  const filteredHoldings = holdings.filter(h => (h.account_type || 'brokerage') === activeAccount);
  const brokerageHoldings = holdings.filter(h => (h.account_type || 'brokerage') === 'brokerage');
  const totalTarget = brokerageHoldings.reduce((s, h) => s + h.target_allocation, 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setAdding(true);
    try {
      await api.addHolding({
        ticker: ticker.toUpperCase().trim(),
        shares: parseFloat(shares),
        avg_cost: parseFloat(avgCost),
        target_allocation: isBrokerage ? (parseFloat(target) || 0) : 0,
        purchase_date: purchaseDate || null,
        account_type: activeAccount,
      });
      setTicker('');
      setShares('');
      setAvgCost('');
      setTarget('');
      setPurchaseDate('');
      await onUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await api.deleteHolding(id);
      await onUpdate();
    } finally {
      setDeleting(null);
    }
  };

  const handleEdit = async (id) => {
    const editAccount = editData.account_type || activeAccount;
    const editIsBrokerage = editAccount === 'brokerage';
    try {
      await api.updateHolding(id, {
        shares: parseFloat(editData.shares),
        avg_cost: parseFloat(editData.avg_cost),
        target_allocation: editIsBrokerage ? (parseFloat(editData.target_allocation) || 0) : 0,
        purchase_date: editData.purchase_date || null,
        account_type: editAccount,
      });
      setEditingId(null);
      await onUpdate();
    } catch (err) {
      setError(err.message);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: MONO,
    background: '#0d1424', border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  };

  const tabColor = ACCOUNT_TABS.find(t => t.id === activeAccount)?.color || C.blue;

  // Grid columns: brokerage has Target %, others don't
  const addGridCols = isBrokerage ? '1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr';
  const editGridCols = isBrokerage ? '60px 1fr 1fr 1fr 1fr 1fr auto' : '60px 1fr 1fr 1fr 1fr auto';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Manage Holdings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>&times;</button>
        </div>

        {/* Account Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: C.bg, borderRadius: 10, padding: 4, border: `1px solid ${C.border}` }}>
          {ACCOUNT_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveAccount(tab.id); setEditingId(null); setError(''); }}
              style={{
                flex: 1, padding: '8px 14px', borderRadius: 8, border: 'none',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: activeAccount === tab.id ? tab.color : 'transparent',
                color: activeAccount === tab.id ? '#fff' : C.textMuted,
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Add Form */}
        <form onSubmit={handleAdd} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Add {isCrypto ? 'Crypto' : activeAccount === '401k' ? '401k' : 'Brokerage'} Holding
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: addGridCols, gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>{isCrypto ? 'Coin' : 'Ticker'}</label>
              <input value={ticker} onChange={e => setTicker(e.target.value)} placeholder={isCrypto ? 'BTC' : 'AAPL'} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>{isCrypto ? 'Amount' : 'Shares'}</label>
              <input type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder={isCrypto ? '0.5' : '10'} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>{isCrypto ? 'Avg Buy Price' : 'Avg Cost'}</label>
              <input type="number" step="any" value={avgCost} onChange={e => setAvgCost(e.target.value)} placeholder={isCrypto ? '45000' : '150.00'} required style={inputStyle} />
            </div>
            {isBrokerage && (
              <div>
                <label style={{ fontSize: 10, color: C.textDim }}>Target %</label>
                <input type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder="5.0" style={inputStyle} />
              </div>
            )}
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>Purchase Date</label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={adding} style={{ padding: '8px 20px', background: tabColor, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>
            {adding ? 'Adding...' : isCrypto ? 'Add Coin' : 'Add Holding'}
          </button>
          {isBrokerage && totalTarget > 0 && (
            <span style={{ marginLeft: 12, fontSize: 11, color: Math.abs(totalTarget - 100) > 5 ? C.amber : C.textDim }}>
              Total target: {totalTarget.toFixed(1)}%{Math.abs(totalTarget - 100) > 5 ? ' (should be ~100%)' : ''}
            </span>
          )}
        </form>

        {/* Existing Holdings */}
        <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          {ACCOUNT_TABS.find(t => t.id === activeAccount)?.label} Holdings ({filteredHoldings.length})
        </div>
        {filteredHoldings.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 12, background: '#0d1424', borderRadius: 8, border: `1px solid ${C.border}` }}>
            No {activeAccount} holdings yet. Add one above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredHoldings.map(h => {
              const hIsBrokerage = (h.account_type || 'brokerage') === 'brokerage';
              const hIsCrypto = h.type === 'Crypto';
              return (
                <div key={h.id} style={{ padding: '10px 14px', background: '#0d1424', borderRadius: 8, border: `1px solid ${C.border}` }}>
                  {editingId === h.id ? (
                    <div style={{ display: 'grid', gridTemplateColumns: editGridCols, gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontFamily: MONO, fontSize: 12 }}>{h.ticker}</span>
                      <input type="number" step="any" value={editData.shares} onChange={e => setEditData({ ...editData, shares: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                      <input type="number" step="any" value={editData.avg_cost} onChange={e => setEditData({ ...editData, avg_cost: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                      {hIsBrokerage && (
                        <input type="number" step="any" value={editData.target_allocation} onChange={e => setEditData({ ...editData, target_allocation: e.target.value })} placeholder="Target %" style={{ ...inputStyle, padding: '4px 8px' }} />
                      )}
                      <input type="date" value={editData.purchase_date || ''} onChange={e => setEditData({ ...editData, purchase_date: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                      <select value={editData.account_type || 'brokerage'} onChange={e => setEditData({ ...editData, account_type: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }}>
                        <option value="brokerage">Brokerage</option>
                        <option value="401k">401k</option>
                        <option value="crypto">Crypto</option>
                      </select>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => handleEdit(h.id)} style={{ padding: '4px 8px', background: C.green, color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '4px 8px', background: C.border, color: C.textMuted, border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontFamily: MONO, minWidth: 50 }}>{h.ticker}</span>
                        <span style={{ fontSize: 11, color: C.textMuted }}>{h.shares} {hIsCrypto ? 'coins' : 'shares'} @ ${h.avg_cost.toFixed(2)}</span>
                        {hIsBrokerage && (
                          <span style={{ fontSize: 11, color: C.textDim }}>Target: {h.target_allocation.toFixed(1)}%</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditingId(h.id); setEditData({ shares: h.shares, avg_cost: h.avg_cost, target_allocation: h.target_allocation, purchase_date: h.purchase_date || '', account_type: h.account_type || 'brokerage' }); }} style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => handleDelete(h.id)} disabled={deleting === h.id} style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 4, fontSize: 11, cursor: 'pointer', opacity: deleting === h.id ? 0.5 : 1 }}>
                          {deleting === h.id ? '...' : 'Delete'}
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
    </div>
  );
}
