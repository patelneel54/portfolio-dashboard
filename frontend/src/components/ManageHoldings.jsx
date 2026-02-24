import { useState } from 'react';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';

export default function ManageHoldings({ holdings, onClose, onUpdate }) {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [target, setTarget] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [accountType, setAccountType] = useState('brokerage');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [deleting, setDeleting] = useState(null);

  const totalTarget = holdings.reduce((s, h) => s + h.target_allocation, 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setAdding(true);
    try {
      await api.addHolding({
        ticker: ticker.toUpperCase().trim(),
        shares: parseFloat(shares),
        avg_cost: parseFloat(avgCost),
        target_allocation: parseFloat(target) || 0,
        purchase_date: purchaseDate || null,
        account_type: accountType,
      });
      setTicker('');
      setShares('');
      setAvgCost('');
      setTarget('');
      setPurchaseDate('');
      setAccountType('brokerage');
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
    try {
      await api.updateHolding(id, {
        shares: parseFloat(editData.shares),
        avg_cost: parseFloat(editData.avg_cost),
        target_allocation: parseFloat(editData.target_allocation) || 0,
        purchase_date: editData.purchase_date || null,
        account_type: editData.account_type || 'brokerage',
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Manage Holdings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 20, cursor: 'pointer', padding: '4px 8px' }}>&times;</button>
        </div>

        {/* Add Form */}
        <form onSubmit={handleAdd} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Add New Holding</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>Ticker</label>
              <input value={ticker} onChange={e => setTicker(e.target.value)} placeholder="AAPL" required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>Shares</label>
              <input type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder="10" required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>Avg Cost</label>
              <input type="number" step="any" value={avgCost} onChange={e => setAvgCost(e.target.value)} placeholder="150.00" required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>Target %</label>
              <input type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder="5.0" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>Purchase Date</label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: C.textDim }}>Account</label>
              <select value={accountType} onChange={e => setAccountType(e.target.value)} style={inputStyle}>
                <option value="brokerage">Brokerage</option>
                <option value="401k">401k</option>
              </select>
            </div>
          </div>
          {error && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={adding} style={{ padding: '8px 20px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>
            {adding ? 'Adding...' : 'Add Holding'}
          </button>
          {totalTarget > 0 && (
            <span style={{ marginLeft: 12, fontSize: 11, color: Math.abs(totalTarget - 100) > 5 ? C.amber : C.textDim }}>
              Total target: {totalTarget.toFixed(1)}%{Math.abs(totalTarget - 100) > 5 ? ' (should be ~100%)' : ''}
            </span>
          )}
        </form>

        {/* Existing Holdings */}
        <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Current Holdings ({holdings.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {holdings.map(h => (
            <div key={h.id} style={{ padding: '10px 14px', background: '#0d1424', borderRadius: 8, border: `1px solid ${C.border}` }}>
              {editingId === h.id ? (
                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontFamily: MONO }}>{h.ticker}</span>
                  <input type="number" step="any" value={editData.shares} onChange={e => setEditData({ ...editData, shares: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                  <input type="number" step="any" value={editData.avg_cost} onChange={e => setEditData({ ...editData, avg_cost: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                  <input type="number" step="any" value={editData.target_allocation} onChange={e => setEditData({ ...editData, target_allocation: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                  <input type="date" value={editData.purchase_date || ''} onChange={e => setEditData({ ...editData, purchase_date: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                  <select value={editData.account_type || 'brokerage'} onChange={e => setEditData({ ...editData, account_type: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }}>
                    <option value="brokerage">Brokerage</option>
                    <option value="401k">401k</option>
                  </select>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => handleEdit(h.id)} style={{ padding: '4px 8px', background: C.green, color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '4px 8px', background: C.border, color: C.textMuted, border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontFamily: MONO, minWidth: 50 }}>{h.ticker}</span>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: (h.account_type || 'brokerage') === '401k' ? C.purple + '22' : C.blue + '22', color: (h.account_type || 'brokerage') === '401k' ? C.purple : C.blue, fontWeight: 700, textTransform: 'uppercase' }}>
                      {h.account_type || 'brokerage'}
                    </span>
                    <span style={{ fontSize: 11, color: C.textMuted }}>{h.shares} shares @ ${h.avg_cost.toFixed(2)}</span>
                    <span style={{ fontSize: 11, color: C.textDim }}>Target: {h.target_allocation.toFixed(1)}%</span>
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
          ))}
        </div>
      </div>
    </div>
  );
}
