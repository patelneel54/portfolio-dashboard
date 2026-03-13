import { useState, useEffect, useRef, useCallback } from 'react';
import { C } from '../styles/theme';

const ACCOUNT_OPTIONS = [
  { id: 'all', label: 'All Accounts', color: C.accent },
  { id: 'brokerage', label: 'Brokerage', color: C.blue },
  { id: '401k', label: '401k', color: C.purple },
  { id: 'crypto', label: 'Crypto', color: '#F7931A' },
];

export default function AccountFilterSheet({ isOpen, onClose, accountFilter, onSelect }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef(0);
  const closing = useRef(false);

  // Mount and animate open
  useEffect(() => {
    if (isOpen) {
      closing.current = false;
      setMounted(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setOpen(true));
      });
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setOpen(false);
    setDragging(false);
    setDragOffset(0);
  }, []);

  const handleTransitionEnd = useCallback(() => {
    if (!open && closing.current) {
      setMounted(false);
      closing.current = false;
      onClose();
    }
  }, [open, onClose]);

  const handleSelect = useCallback((id) => {
    onSelect(id);
    handleClose();
  }, [onSelect, handleClose]);

  // Touch drag handlers
  const onTouchStart = useCallback((e) => {
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  }, []);

  const onTouchMove = useCallback((e) => {
    const deltaY = e.touches[0].clientY - dragStartY.current;
    setDragOffset(Math.max(0, deltaY));
  }, []);

  const onTouchEnd = useCallback(() => {
    setDragging(false);
    if (dragOffset > 100) {
      handleClose();
    } else {
      setDragOffset(0);
    }
  }, [dragOffset, handleClose]);

  if (!mounted) return null;

  const sheetTransform = dragging
    ? `translateY(${dragOffset}px)`
    : open ? 'translateY(0)' : 'translateY(100%)';

  const sheetTransition = dragging
    ? 'none'
    : 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)';

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: open && !dragging ? 'rgba(0,0,0,0.5)' : `rgba(0,0,0,${Math.max(0, 0.5 - (dragOffset / 600))})`,
        transition: dragging ? 'none' : 'background 250ms',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select account"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTransitionEnd={handleTransitionEnd}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001,
          background: C.card,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          border: `1px solid ${C.border}`, borderBottom: 'none',
          transform: sheetTransform,
          transition: sheetTransition,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.textDim }} />
        </div>

        {/* Title */}
        <div style={{ padding: '0 20px 12px', fontSize: 15, fontWeight: 700, color: C.text }}>
          Select Account
        </div>

        {/* Options */}
        {ACCOUNT_OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => handleSelect(opt.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '14px 20px', border: 'none', minHeight: 44,
              background: accountFilter === opt.id ? C.accent + '18' : 'transparent',
              color: accountFilter === opt.id ? C.text : C.textMuted,
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              borderBottom: `1px solid ${C.border}`,
              transition: 'background 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: opt.color }} />
              {opt.label}
            </div>
            {accountFilter === opt.id && (
              <span style={{ color: C.accent, fontSize: 18 }}>&#10003;</span>
            )}
          </button>
        ))}

        {/* Bottom spacing */}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
