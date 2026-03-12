import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import useMediaQuery from '../hooks/useMediaQuery';

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
  const [confirmDelete, setConfirmDelete] = useState(null);

  const isMobile = useMediaQuery('(max-width: 767px)');

  // Mobile animation state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef(0);
  const closing = useRef(false);
  const [menuOpenId, setMenuOpenId] = useState(null);

  // Slide-up animation on mount (mobile only)
  useEffect(() => {
    if (isMobile) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSheetOpen(true));
      });
    }
  }, [isMobile]);

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
    setConfirmDelete(null);
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

  // Mobile close with animation
  const handleMobileClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setSheetOpen(false);
    setDragging(false);
    setDragOffset(0);
  }, []);

  const handleTransitionEnd = useCallback(() => {
    if (!sheetOpen && closing.current) {
      closing.current = false;
      onClose();
    }
  }, [sheetOpen, onClose]);

  // Touch drag handlers (header only)
  const onTouchStart = useCallback((e) => {
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  }, []);

  const onTouchMove = useCallback((e) => {
    const delta = e.touches[0].clientY - dragStartY.current;
    setDragOffset(Math.max(0, delta));
  }, []);

  const onTouchEnd = useCallback(() => {
    setDragging(false);
    if (dragOffset > 120) {
      handleMobileClose();
    } else {
      setDragOffset(0);
    }
  }, [dragOffset, handleMobileClose]);

  const inputStyle = {
    width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: MONO,
    background: '#0d1424', border: `1px solid ${C.border}`, borderRadius: 6,
    color: C.text, outline: 'none', boxSizing: 'border-box',
  };

  const mobileInputStyle = {
    width: '100%', padding: '12px 14px', fontSize: 16, fontFamily: MONO,
    background: '#0d1424', border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, outline: 'none', boxSizing: 'border-box', minHeight: 48,
  };

  const tabColor = ACCOUNT_TABS.find(t => t.id === activeAccount)?.color || C.blue;

  // Grid columns: brokerage has Target %, others don't
  const addGridCols = isBrokerage ? '1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr';
  const editGridCols = isBrokerage ? '60px 1fr 1fr 1fr 1fr 1fr auto' : '60px 1fr 1fr 1fr 1fr auto';

  const startEditing = (h) => {
    setEditingId(h.id);
    setEditData({ shares: h.shares, avg_cost: h.avg_cost, target_allocation: h.target_allocation, purchase_date: h.purchase_date || '', account_type: h.account_type || 'brokerage' });
  };

  const switchTab = (tabId) => {
    setActiveAccount(tabId);
    setEditingId(null);
    setError('');
    setMenuOpenId(null);
  };

  // --- Render helpers ---

  const renderAccountTabs = (mobile) => (
    <div style={{ display: 'flex', gap: 4, marginBottom: mobile ? 16 : 20, background: C.bg, borderRadius: 10, padding: 4, border: `1px solid ${C.border}` }}>
      {ACCOUNT_TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => switchTab(tab.id)}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44,
            background: activeAccount === tab.id ? tab.color : 'transparent',
            color: activeAccount === tab.id ? '#fff' : C.textMuted,
            transition: 'all 0.2s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const renderDeleteConfirmation = () => {
    if (!confirmDelete) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmDelete(null)}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 320, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: C.text, fontWeight: 600 }}>
            Delete {confirmDelete.ticker}? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => setConfirmDelete(null)} style={{ minHeight: 44, padding: '10px 24px', background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={() => handleDelete(confirmDelete.id)} style={{ minHeight: 44, padding: '10px 24px', background: C.red, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDesktopModal = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Manage Holdings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 20, cursor: 'pointer', padding: '10px 14px', minHeight: 44, minWidth: 44 }}>&times;</button>
        </div>

        {renderAccountTabs(false)}

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
          <button type="submit" disabled={adding} style={{ padding: '10px 20px', minHeight: 44, background: tabColor, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>
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
                        <button onClick={() => handleEdit(h.id)} style={{ padding: '10px 14px', minHeight: 44, background: C.green, color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '10px 14px', minHeight: 44, background: C.border, color: C.textMuted, border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
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
                        <button onClick={() => startEditing(h)} style={{ padding: '10px 16px', minHeight: 44, background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => setConfirmDelete(h)} disabled={deleting === h.id} style={{ padding: '10px 16px', minHeight: 44, background: 'transparent', border: `1px solid ${C.red}44`, color: C.red, borderRadius: 4, fontSize: 12, cursor: 'pointer', opacity: deleting === h.id ? 0.5 : 1 }}>
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

  const renderMobileSheet = () => {
    const sheetTransform = dragging
      ? `translateY(${dragOffset}px)`
      : sheetOpen ? 'translateY(0)' : 'translateY(100%)';
    const sheetTransition = dragging
      ? 'none'
      : 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)';

    return (
      <div
        onClick={handleMobileClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: sheetOpen && !dragging
            ? 'rgba(0,0,0,0.5)'
            : `rgba(0,0,0,${Math.max(0, 0.5 - dragOffset / 600)})`,
          transition: dragging ? 'none' : 'background 250ms',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          onTransitionEnd={handleTransitionEnd}
          style={{
            position: 'fixed', inset: 0, zIndex: 1001,
            background: C.card,
            transform: sheetTransform,
            transition: sheetTransition,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header (draggable for close gesture) */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 4 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: C.textDim }} />
            </div>

            {/* Title + Close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px 12px', borderBottom: `1px solid ${C.border}` }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>Manage Holdings</h2>
              <button
                onClick={handleMobileClose}
                style={{
                  background: 'none', border: 'none', color: C.textMuted,
                  fontSize: 20, cursor: 'pointer',
                  padding: '10px 14px', minHeight: 44, minWidth: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div style={{
            flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
            padding: 16, paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          }}>
            {renderAccountTabs(true)}

            {/* Add Form - stacked vertical */}
            <form onSubmit={handleAdd} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                Add {isCrypto ? 'Crypto' : activeAccount === '401k' ? '401k' : 'Brokerage'} Holding
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{isCrypto ? 'Coin' : 'Ticker'}</label>
                  <input value={ticker} onChange={e => setTicker(e.target.value)} placeholder={isCrypto ? 'BTC' : 'AAPL'} required style={mobileInputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{isCrypto ? 'Amount' : 'Shares'}</label>
                    <input type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder={isCrypto ? '0.5' : '10'} required style={mobileInputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{isCrypto ? 'Avg Buy Price' : 'Avg Cost'}</label>
                    <input type="number" step="any" value={avgCost} onChange={e => setAvgCost(e.target.value)} placeholder={isCrypto ? '45000' : '150.00'} required style={mobileInputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isBrokerage ? '1fr 1fr' : '1fr', gap: 12 }}>
                  {isBrokerage && (
                    <div>
                      <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Target %</label>
                      <input type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder="5.0" style={mobileInputStyle} />
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Purchase Date</label>
                    <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={mobileInputStyle} />
                  </div>
                </div>
              </div>
              {error && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{error}</div>}
              <button type="submit" disabled={adding} style={{
                width: '100%', padding: '14px 20px', minHeight: 48,
                background: tabColor, color: '#fff', border: 'none',
                borderRadius: 10, fontSize: 15, fontWeight: 600,
                cursor: 'pointer', opacity: adding ? 0.6 : 1, marginTop: 12,
              }}>
                {adding ? 'Adding...' : isCrypto ? 'Add Coin' : 'Add Holding'}
              </button>
              {isBrokerage && totalTarget > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: Math.abs(totalTarget - 100) > 5 ? C.amber : C.textDim, textAlign: 'center' }}>
                  Total target: {totalTarget.toFixed(1)}%{Math.abs(totalTarget - 100) > 5 ? ' (should be ~100%)' : ''}
                </div>
              )}
            </form>

            {/* Holdings List */}
            <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
              {ACCOUNT_TABS.find(t => t.id === activeAccount)?.label} Holdings ({filteredHoldings.length})
            </div>
            {filteredHoldings.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 13, background: '#0d1424', borderRadius: 10, border: `1px solid ${C.border}` }}>
                No {activeAccount} holdings yet. Add one above.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredHoldings.map(h => {
                  const hIsBrokerage = (h.account_type || 'brokerage') === 'brokerage';
                  const hIsCrypto = h.type === 'Crypto';
                  return (
                    <div key={h.id} style={{ padding: '14px 16px', background: '#0d1424', borderRadius: 10, border: `1px solid ${C.border}`, position: 'relative' }}>
                      {editingId === h.id ? (
                        /* Mobile edit form - stacked */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ fontWeight: 700, fontFamily: MONO, fontSize: 15, color: C.text }}>{h.ticker}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{hIsCrypto ? 'Amount' : 'Shares'}</label>
                              <input type="number" step="any" value={editData.shares} onChange={e => setEditData({ ...editData, shares: e.target.value })} style={mobileInputStyle} />
                            </div>
                            <div>
                              <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{hIsCrypto ? 'Avg Buy Price' : 'Avg Cost'}</label>
                              <input type="number" step="any" value={editData.avg_cost} onChange={e => setEditData({ ...editData, avg_cost: e.target.value })} style={mobileInputStyle} />
                            </div>
                          </div>
                          {hIsBrokerage && (
                            <div>
                              <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Target %</label>
                              <input type="number" step="any" value={editData.target_allocation} onChange={e => setEditData({ ...editData, target_allocation: e.target.value })} placeholder="Target %" style={mobileInputStyle} />
                            </div>
                          )}
                          <div>
                            <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Purchase Date</label>
                            <input type="date" value={editData.purchase_date || ''} onChange={e => setEditData({ ...editData, purchase_date: e.target.value })} style={mobileInputStyle} />
                          </div>
                          <div>
                            <label style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Account</label>
                            <select value={editData.account_type || 'brokerage'} onChange={e => setEditData({ ...editData, account_type: e.target.value })} style={mobileInputStyle}>
                              <option value="brokerage">Brokerage</option>
                              <option value="401k">401k</option>
                              <option value="crypto">Crypto</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                            <button onClick={() => handleEdit(h.id)} style={{ flex: 1, padding: 12, minHeight: 48, background: C.green, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: 12, minHeight: 48, background: C.border, color: C.textMuted, border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        /* Mobile display row with three-dot menu */
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 700, fontFamily: MONO, fontSize: 15, color: C.text }}>{h.ticker}</span>
                              {hIsBrokerage && (
                                <span style={{ fontSize: 12, color: C.textDim }}>Target: {h.target_allocation.toFixed(1)}%</span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>
                              {h.shares} {hIsCrypto ? 'coins' : 'shares'} @ ${h.avg_cost.toFixed(2)}
                            </div>
                          </div>
                          {/* Three-dot menu button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === h.id ? null : h.id); }}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: 10, minHeight: 44, minWidth: 44,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: C.textMuted,
                            }}
                          >
                            <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
                              <circle cx={12} cy={5} r={2} />
                              <circle cx={12} cy={12} r={2} />
                              <circle cx={12} cy={19} r={2} />
                            </svg>
                          </button>
                          {/* Popover menu */}
                          {menuOpenId === h.id && (
                            <>
                              <div style={{ position: 'fixed', inset: 0, zIndex: 1050 }} onClick={() => setMenuOpenId(null)} />
                              <div style={{
                                position: 'absolute', top: 8, right: 52,
                                background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                                padding: 4, minWidth: 140, zIndex: 1060,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                              }}>
                                <button
                                  onClick={() => { setMenuOpenId(null); startEditing(h); }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    width: '100%', padding: '12px 14px', border: 'none',
                                    borderRadius: 8, background: 'transparent',
                                    color: C.text, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => { setMenuOpenId(null); setConfirmDelete(h); }}
                                  disabled={deleting === h.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    width: '100%', padding: '12px 14px', border: 'none',
                                    borderRadius: 8, background: 'transparent',
                                    color: C.red, cursor: 'pointer', fontSize: 14, fontWeight: 500,
                                    opacity: deleting === h.id ? 0.5 : 1,
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {isMobile ? renderMobileSheet() : renderDesktopModal()}
      {renderDeleteConfirmation()}
    </>
  );
}
