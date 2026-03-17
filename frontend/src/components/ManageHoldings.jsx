import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../hooks/useApi';
import { C, MONO, ASSET_CLASS_LABELS } from '../styles/theme';
import { inputStyle as baseInputStyle } from '../styles/shared';
import useMediaQuery from '../hooks/useMediaQuery';
import SearchInput from './SearchInput';
import { haptic } from '../utils/haptics';
import useFocusTrap from '../hooks/useFocusTrap';

const ACCOUNT_TABS = [
  { id: 'brokerage', label: 'Brokerage', color: C.blue },
  { id: '401k', label: '401k', color: C.purple },
  { id: 'crypto', label: 'Crypto', color: '#F7931A' },
];

/**
 * @param {Object} props
 * @param {import('../types').Holding[]} props.holdings - All holdings (unfiltered)
 * @param {() => void} props.onClose - Close the modal
 * @param {() => Promise<void>} props.onUpdate - Callback to refresh holdings data
 * @param {string} props.accountFilter - Current account filter ('all'|'brokerage'|'401k'|'crypto')
 */
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isManual, setIsManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [assetClass, setAssetClass] = useState('');
  const [benchmarkTicker, setBenchmarkTicker] = useState('');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const csvInputRef = useRef(null);

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

  const filteredHoldings = holdings.filter(h => {
    if ((h.account_type || 'brokerage') !== activeAccount) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase();
      return h.ticker.toUpperCase().includes(q) || (h.manual_name || '').toUpperCase().includes(q);
    }
    return true;
  });
  const brokerageHoldings = holdings.filter(h => (h.account_type || 'brokerage') === 'brokerage');
  const totalTarget = brokerageHoldings.reduce((s, h) => s + h.target_allocation, 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setAdding(true);
    try {
      const payload = {
        ticker: isManual ? ticker.toUpperCase().trim() || manualName.toUpperCase().replace(/\s+/g, '-').substring(0, 16) : ticker.toUpperCase().trim(),
        shares: parseFloat(shares),
        avg_cost: parseFloat(avgCost),
        target_allocation: isBrokerage ? (parseFloat(target) || 0) : 0,
        purchase_date: purchaseDate || null,
        account_type: activeAccount,
        is_manual: isManual,
        manual_name: isManual ? manualName : null,
        asset_class: assetClass || null,
        current_price: isManual ? parseFloat(currentPrice) : undefined,
        benchmark_ticker: isManual && benchmarkTicker ? benchmarkTicker : null,
      };
      await api.addHolding(payload);
      setTicker(''); setShares(''); setAvgCost(''); setTarget('');
      setPurchaseDate(''); setIsManual(false); setManualName('');
      setCurrentPrice(''); setAssetClass(''); setBenchmarkTicker('');
      await onUpdate();
      haptic();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleCsvImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);
    setError('');
    try {
      const result = await api.importFidelityCSV(file);
      setCsvResult(result);
      await onUpdate();
      haptic();
    } catch (err) {
      setError(err.message);
    } finally {
      setCsvImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    setConfirmDelete(null);
    try {
      await api.deleteHolding(id);
      await onUpdate();
      haptic();
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

  // Unified close for focus trap Escape key
  const handleClose = useCallback(() => {
    if (confirmDelete) {
      setConfirmDelete(null);
      return;
    }
    if (isMobile) {
      handleMobileClose();
    } else {
      onClose();
    }
  }, [isMobile, handleMobileClose, onClose, confirmDelete]);

  const focusTrapRef = useFocusTrap({ isActive: true, onEscape: handleClose });

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

  const inputStyle = { ...baseInputStyle, padding: '8px 10px', fontSize: 13, borderRadius: 6 };
  const mobileInputStyle = { ...baseInputStyle, padding: '12px 14px', minHeight: 48 };

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
    setSearchQuery('');
  };

  // --- Render helpers ---

  const renderAccountTabs = (mobile) => (
    <div role="tablist" aria-label="Account type" style={{ display: 'flex', gap: 4, marginBottom: mobile ? 16 : 20, background: C.bg, borderRadius: 10, padding: 4, border: `1px solid ${C.border}` }}>
      {ACCOUNT_TABS.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeAccount === tab.id}
          onClick={() => switchTab(tab.id)}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44,
            background: activeAccount === tab.id ? tab.color : 'transparent',
            color: activeAccount === tab.id ? '#fff' : C.textMuted,
            transition: 'background 0.15s, color 0.15s',
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
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmDelete(null)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setConfirmDelete(null); } }}>
        <div role="alertdialog" aria-modal="true" aria-label="Confirm deletion" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: 320, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: C.text, fontWeight: 600 }}>
            Delete {confirmDelete.ticker}? This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button ref={el => el?.focus()} onClick={() => setConfirmDelete(null)} style={{ minHeight: 44, padding: '10px 24px', background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
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
      <div ref={focusTrapRef} role="dialog" aria-modal="true" aria-label="Manage holdings" style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Manage Holdings</h2>
          <button onClick={onClose} aria-label="Close manage holdings" style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 20, cursor: 'pointer', padding: '10px 14px', minHeight: 44, minWidth: 44 }}>&times;</button>
        </div>

        {renderAccountTabs(false)}

        {/* CSV Import for 401k */}
        {activeAccount === '401k' && (
          <div style={{ marginBottom: 16 }}>
            <input ref={csvInputRef} type="file" accept=".csv" onChange={handleCsvImport} style={{ display: 'none' }} />
            <button onClick={() => csvInputRef.current?.click()} disabled={csvImporting} style={{ padding: '10px 16px', minHeight: 44, background: 'transparent', border: `1px solid ${C.purple}`, color: C.purple, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: csvImporting ? 0.6 : 1 }}>
              {csvImporting ? 'Importing...' : 'Import from Fidelity CSV'}
            </button>
            {csvResult && (
              <span style={{ marginLeft: 10, fontSize: 11, color: C.green }}>
                Added {csvResult.added}, Updated {csvResult.updated}{csvResult.errors?.length ? `, ${csvResult.errors.length} errors` : ''}
              </span>
            )}
          </div>
        )}

        {/* Add Form */}
        <form onSubmit={handleAdd} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              Add {isCrypto ? 'Crypto' : activeAccount === '401k' ? '401k' : 'Brokerage'} Holding
            </div>
            {activeAccount === '401k' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textMuted, cursor: 'pointer' }}>
                <input type="checkbox" checked={isManual} onChange={e => setIsManual(e.target.checked)} style={{ accentColor: C.purple }} />
                Manual fund (no ticker)
              </label>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: addGridCols, gap: 8, marginBottom: 8 }}>
            {isManual ? (
              <>
                <div>
                  <label htmlFor="add-manualname" style={{ fontSize: 10, color: C.textDim }}>Fund Name</label>
                  <input id="add-manualname" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="LARGE CAP VAL III" required style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="add-curprice" style={{ fontSize: 10, color: C.textDim }}>Current Price</label>
                  <input id="add-curprice" type="number" step="any" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="25.00" required style={inputStyle} />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="add-ticker" style={{ fontSize: 10, color: C.textDim }}>{isCrypto ? 'Coin' : 'Ticker'}</label>
                <input id="add-ticker" value={ticker} onChange={e => setTicker(e.target.value)} placeholder={isCrypto ? 'BTC' : 'FXAIX'} required style={inputStyle} />
              </div>
            )}
            <div>
              <label htmlFor="add-shares" style={{ fontSize: 10, color: C.textDim }}>{isCrypto ? 'Amount' : 'Shares'}</label>
              <input id="add-shares" type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder={isCrypto ? '0.5' : '10'} required style={inputStyle} />
            </div>
            <div>
              <label htmlFor="add-avgcost" style={{ fontSize: 10, color: C.textDim }}>{isCrypto ? 'Avg Buy Price' : 'Avg Cost'}</label>
              <input id="add-avgcost" type="number" step="any" value={avgCost} onChange={e => setAvgCost(e.target.value)} placeholder={isCrypto ? '45000' : '150.00'} required style={inputStyle} />
            </div>
            {isBrokerage && (
              <div>
                <label htmlFor="add-target" style={{ fontSize: 10, color: C.textDim }}>Target %</label>
                <input id="add-target" type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder="5.0" style={inputStyle} />
              </div>
            )}
            <div>
              <label htmlFor="add-date" style={{ fontSize: 10, color: C.textDim }}>Purchase Date</label>
              <input id="add-date" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {/* Asset class + benchmark row */}
          {(activeAccount === '401k' || assetClass) && (
            <div style={{ display: 'grid', gridTemplateColumns: isManual ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label htmlFor="add-assetclass" style={{ fontSize: 10, color: C.textDim }}>Asset Class</label>
                <select id="add-assetclass" value={assetClass} onChange={e => setAssetClass(e.target.value)} style={inputStyle}>
                  <option value="">Auto-detect</option>
                  {Object.entries(ASSET_CLASS_LABELS).filter(([k]) => k !== 'crypto' && k !== 'unclassified').map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {isManual && (
                <div>
                  <label htmlFor="add-benchmark" style={{ fontSize: 10, color: C.textDim }}>Benchmark Proxy (for auto-refresh)</label>
                  <input id="add-benchmark" value={benchmarkTicker} onChange={e => setBenchmarkTicker(e.target.value)} placeholder="IWD, AGG, VOT..." style={inputStyle} />
                </div>
              )}
            </div>
          )}
          {error && <div role="alert" style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button type="submit" disabled={adding} aria-busy={adding} style={{ padding: '10px 20px', minHeight: 44, background: tabColor, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>
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
        <div style={{ marginBottom: 10 }}>
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
        </div>
        {filteredHoldings.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 12, background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` }}>
            {searchQuery.trim() ? `No holdings match '${searchQuery.trim()}'` : `No ${activeAccount} holdings yet. Add one above.`}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredHoldings.map(h => {
              const hIsBrokerage = (h.account_type || 'brokerage') === 'brokerage';
              const hIsCrypto = h.type === 'Crypto';
              return (
                <div key={h.id} style={{ padding: '10px 14px', background: C.elevated, borderRadius: 8, border: `1px solid ${C.border}` }}>
                  {editingId === h.id ? (
                    <div style={{ display: 'grid', gridTemplateColumns: editGridCols, gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontFamily: MONO, fontSize: 12 }}>{h.ticker}</span>
                      <input type="number" step="any" aria-label="Shares" value={editData.shares} onChange={e => setEditData({ ...editData, shares: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                      <input type="number" step="any" aria-label="Average cost" value={editData.avg_cost} onChange={e => setEditData({ ...editData, avg_cost: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                      {hIsBrokerage && (
                        <input type="number" step="any" aria-label="Target allocation" value={editData.target_allocation} onChange={e => setEditData({ ...editData, target_allocation: e.target.value })} placeholder="Target %" style={{ ...inputStyle, padding: '4px 8px' }} />
                      )}
                      <input type="date" aria-label="Purchase date" value={editData.purchase_date || ''} onChange={e => setEditData({ ...editData, purchase_date: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }} />
                      <select aria-label="Account type" value={editData.account_type || 'brokerage'} onChange={e => setEditData({ ...editData, account_type: e.target.value })} style={{ ...inputStyle, padding: '4px 8px' }}>
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
                        <span style={{ fontWeight: 700, fontFamily: MONO, minWidth: 50 }}>{h.is_manual && h.manual_name ? h.manual_name : h.ticker}</span>
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
          ref={focusTrapRef}
          role="dialog"
          aria-modal="true"
          aria-label="Manage holdings"
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>Manage Holdings</h2>
              <button
                onClick={handleMobileClose}
                aria-label="Close manage holdings"
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

            {/* CSV Import for 401k */}
            {activeAccount === '401k' && (
              <div style={{ marginBottom: 16 }}>
                <input ref={csvInputRef} type="file" accept=".csv" onChange={handleCsvImport} style={{ display: 'none' }} />
                <button onClick={() => csvInputRef.current?.click()} disabled={csvImporting} style={{ width: '100%', padding: '12px 16px', minHeight: 48, background: 'transparent', border: `1px solid ${C.purple}`, color: C.purple, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: csvImporting ? 0.6 : 1 }}>
                  {csvImporting ? 'Importing...' : 'Import from Fidelity CSV'}
                </button>
                {csvResult && (
                  <div style={{ marginTop: 8, fontSize: 12, color: C.green, textAlign: 'center' }}>
                    Added {csvResult.added}, Updated {csvResult.updated}{csvResult.errors?.length ? `, ${csvResult.errors.length} errors` : ''}
                  </div>
                )}
              </div>
            )}

            {/* Add Form - stacked vertical */}
            <form onSubmit={handleAdd} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Add {isCrypto ? 'Crypto' : activeAccount === '401k' ? '401k' : 'Brokerage'} Holding
                </div>
                {activeAccount === '401k' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.textMuted, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isManual} onChange={e => setIsManual(e.target.checked)} style={{ accentColor: C.purple }} />
                    Manual
                  </label>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {isManual ? (
                  <>
                    <div>
                      <label htmlFor="m-add-manualname" style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Fund Name</label>
                      <input id="m-add-manualname" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="LARGE CAP VAL III I1" required style={mobileInputStyle} />
                    </div>
                    <div>
                      <label htmlFor="m-add-curprice" style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Current Price</label>
                      <input id="m-add-curprice" type="number" step="any" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} placeholder="25.00" required style={mobileInputStyle} />
                    </div>
                  </>
                ) : (
                  <div>
                    <label htmlFor="m-add-ticker" style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{isCrypto ? 'Coin' : 'Ticker'}</label>
                    <input id="m-add-ticker" value={ticker} onChange={e => setTicker(e.target.value)} placeholder={isCrypto ? 'BTC' : 'FXAIX'} required style={mobileInputStyle} />
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label htmlFor="m-add-shares" style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{isCrypto ? 'Amount' : 'Shares'}</label>
                    <input id="m-add-shares" type="number" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder={isCrypto ? '0.5' : '10'} required style={mobileInputStyle} />
                  </div>
                  <div>
                    <label htmlFor="m-add-avgcost" style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{isCrypto ? 'Avg Buy Price' : 'Avg Cost'}</label>
                    <input id="m-add-avgcost" type="number" step="any" value={avgCost} onChange={e => setAvgCost(e.target.value)} placeholder={isCrypto ? '45000' : '150.00'} required style={mobileInputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isBrokerage ? '1fr 1fr' : '1fr', gap: 12 }}>
                  {isBrokerage && (
                    <div>
                      <label htmlFor="m-add-target" style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Target %</label>
                      <input id="m-add-target" type="number" step="any" value={target} onChange={e => setTarget(e.target.value)} placeholder="5.0" style={mobileInputStyle} />
                    </div>
                  )}
                  <div>
                    <label htmlFor="m-add-date" style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Purchase Date</label>
                    <input id="m-add-date" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={mobileInputStyle} />
                  </div>
                </div>
                {/* Asset class + benchmark */}
                {(activeAccount === '401k' || assetClass) && (
                  <div style={{ display: 'grid', gridTemplateColumns: isManual ? '1fr 1fr' : '1fr', gap: 12 }}>
                    <div>
                      <label htmlFor="m-add-assetclass" style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Asset Class</label>
                      <select id="m-add-assetclass" value={assetClass} onChange={e => setAssetClass(e.target.value)} style={mobileInputStyle}>
                        <option value="">Auto-detect</option>
                        {Object.entries(ASSET_CLASS_LABELS).filter(([k]) => k !== 'crypto' && k !== 'unclassified').map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    {isManual && (
                      <div>
                        <label htmlFor="m-add-benchmark" style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Benchmark Proxy</label>
                        <input id="m-add-benchmark" value={benchmarkTicker} onChange={e => setBenchmarkTicker(e.target.value)} placeholder="IWD, AGG..." style={mobileInputStyle} />
                      </div>
                    )}
                  </div>
                )}
              </div>
              {error && <div role="alert" style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{error}</div>}
              <button type="submit" disabled={adding} aria-busy={adding} style={{
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
            <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.bg, paddingBottom: 8 }}>
              <SearchInput value={searchQuery} onChange={setSearchQuery} />
            </div>
            {filteredHoldings.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 13, background: C.elevated, borderRadius: 10, border: `1px solid ${C.border}` }}>
                {searchQuery.trim() ? `No holdings match '${searchQuery.trim()}'` : `No ${activeAccount} holdings yet. Add one above.`}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredHoldings.map(h => {
                  const hIsBrokerage = (h.account_type || 'brokerage') === 'brokerage';
                  const hIsCrypto = h.type === 'Crypto';
                  return (
                    <div key={h.id} style={{ padding: '14px 16px', background: C.elevated, borderRadius: 10, border: `1px solid ${C.border}`, position: 'relative' }}>
                      {editingId === h.id ? (
                        /* Mobile edit form - stacked */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ fontWeight: 700, fontFamily: MONO, fontSize: 15, color: C.text }}>{h.ticker}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <label htmlFor={`m-edit-shares-${h.id}`} style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{hIsCrypto ? 'Amount' : 'Shares'}</label>
                              <input id={`m-edit-shares-${h.id}`} type="number" step="any" value={editData.shares} onChange={e => setEditData({ ...editData, shares: e.target.value })} style={mobileInputStyle} />
                            </div>
                            <div>
                              <label htmlFor={`m-edit-cost-${h.id}`} style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>{hIsCrypto ? 'Avg Buy Price' : 'Avg Cost'}</label>
                              <input id={`m-edit-cost-${h.id}`} type="number" step="any" value={editData.avg_cost} onChange={e => setEditData({ ...editData, avg_cost: e.target.value })} style={mobileInputStyle} />
                            </div>
                          </div>
                          {hIsBrokerage && (
                            <div>
                              <label htmlFor={`m-edit-target-${h.id}`} style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Target %</label>
                              <input id={`m-edit-target-${h.id}`} type="number" step="any" value={editData.target_allocation} onChange={e => setEditData({ ...editData, target_allocation: e.target.value })} placeholder="Target %" style={mobileInputStyle} />
                            </div>
                          )}
                          <div>
                            <label htmlFor={`m-edit-date-${h.id}`} style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Purchase Date</label>
                            <input id={`m-edit-date-${h.id}`} type="date" value={editData.purchase_date || ''} onChange={e => setEditData({ ...editData, purchase_date: e.target.value })} style={mobileInputStyle} />
                          </div>
                          <div>
                            <label htmlFor={`m-edit-account-${h.id}`} style={{ fontSize: 14, color: C.textMuted, display: 'block', marginBottom: 4 }}>Account</label>
                            <select id={`m-edit-account-${h.id}`} value={editData.account_type || 'brokerage'} onChange={e => setEditData({ ...editData, account_type: e.target.value })} style={mobileInputStyle}>
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
                              <span style={{ fontWeight: 700, fontFamily: MONO, fontSize: 15, color: C.text }}>{h.is_manual && h.manual_name ? h.manual_name : h.ticker}</span>
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
                            aria-label={`Options for ${h.ticker}`}
                            aria-haspopup="true"
                            aria-expanded={menuOpenId === h.id}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: 10, minHeight: 44, minWidth: 44,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: C.textMuted,
                            }}
                          >
                            <svg aria-hidden="true" focusable="false" width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
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
