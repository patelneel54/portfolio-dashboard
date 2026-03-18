import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { C, MONO } from '../styles/theme';
import { api } from '../hooks/useApi';
import { cardStyle, buttonSecondary, badge, labelStyle } from '../styles/shared';
import { InlineError } from './ErrorBoundary';
import { SkeletonCard } from './SkeletonLoader';
import { useIsMobile } from '../hooks/useMediaQuery';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function formatFullDate(monthStr, day) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── Day Cell ── */
function DayCell({ day, isCurrentMonth, isToday, events, isPastDay, isSelected, onSelect, isMobile }) {
  const [hovered, setHovered] = useState(false);
  if (day === null) {
    return <div style={{ minHeight: isMobile ? 56 : 72, padding: isMobile ? 3 : 6, background: 'transparent' }} />;
  }

  const hasEvents = events && events.length > 0;
  const maxVisible = isMobile ? 2 : 3;
  const visibleEvents = hasEvents ? events.slice(0, maxVisible) : [];
  const overflow = hasEvents ? events.length - maxVisible : 0;

  return (
    <div
      onClick={() => hasEvents && onSelect(day)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minHeight: isMobile ? 56 : 72,
        padding: isMobile ? 3 : 6,
        background: isSelected
          ? C.accent + '18'
          : isToday
            ? C.accent + '11'
            : hovered && hasEvents
              ? C.border + '33'
              : 'transparent',
        border: isSelected
          ? `2px solid ${C.accent}`
          : `1px solid ${isToday ? C.accent + '44' : C.border + '44'}`,
        borderRadius: isMobile ? 6 : 8,
        overflow: 'hidden',
        cursor: hasEvents ? 'pointer' : 'default',
        transition: 'background 0.15s, border-color 0.15s',
        position: 'relative',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        fontSize: isMobile ? 11 : 12,
        color: isCurrentMonth ? C.text : C.textMuted,
        fontWeight: isToday ? 700 : 400,
        marginBottom: 2,
      }}>
        {day}
      </div>
      {visibleEvents.map((ev, i) => {
        const isPay = ev._isPaymentEntry;
        const evColor = isPastDay ? C.textDim : isPay ? C.cyan : C.amber;
        return (
          <div key={i} style={{
            fontSize: isMobile ? 8 : 9,
            padding: isMobile ? '1px 3px' : '2px 4px',
            borderRadius: 3,
            marginBottom: 1,
            background: isPastDay ? C.textDim + '18' : evColor + '22',
            color: evColor,
            fontFamily: MONO,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontStyle: ev.estimated ? 'italic' : 'normal',
          }}>
            {ev.ticker.replace('-USD', '')}{isPay ? ' Pay' : ''} ${ev.estimated_income.toFixed(0)}
          </div>
        );
      })}
      {overflow > 0 && (
        <div style={{
          fontSize: isMobile ? 8 : 9, color: C.accent, fontWeight: 700, fontFamily: MONO,
          padding: isMobile ? '0 3px' : '0 4px',
        }}>
          +{overflow} more
        </div>
      )}
      {hasEvents && !isSelected && (
        <div style={{
          position: 'absolute', top: isMobile ? 3 : 4, right: isMobile ? 3 : 4,
          width: 6, height: 6, borderRadius: 3,
          background: isPastDay ? C.textDim : C.accent,
        }} />
      )}
    </div>
  );
}


/* ── Day Detail Sheet/Modal ── */
function DayDetailSheet({ isOpen, onClose, day, month, events, isMobile }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef(0);
  const closing = useRef(false);

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

  // Touch drag handlers (mobile only)
  const onTouchStart = useCallback((e) => {
    if (!isMobile) return;
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  }, [isMobile]);

  const onTouchMove = useCallback((e) => {
    if (!isMobile) return;
    const deltaY = e.touches[0].clientY - dragStartY.current;
    setDragOffset(Math.max(0, deltaY));
  }, [isMobile]);

  const onTouchEnd = useCallback(() => {
    if (!isMobile) return;
    setDragging(false);
    if (dragOffset > 100) {
      handleClose();
    } else {
      setDragOffset(0);
    }
  }, [isMobile, dragOffset, handleClose]);

  // Close on Escape key
  useEffect(() => {
    if (!mounted) return;
    const handleKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mounted, handleClose]);

  if (!mounted) return null;

  const dateLabel = day && month ? formatFullDate(month, day) : '';
  const dayTotal = (events || []).reduce((s, ev) => s + (ev.estimated_income || 0), 0);

  // Mobile: bottom sheet with drag-to-dismiss
  // Desktop: centered modal
  const mobileSheetTransform = dragging
    ? `translateY(${dragOffset}px)`
    : open ? 'translateY(0)' : 'translateY(100%)';

  const desktopModalTransform = open ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)';

  const sheetTransition = dragging
    ? 'none'
    : isMobile
      ? 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)'
      : 'transform 200ms ease-out, opacity 200ms ease-out';

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: open && !dragging
          ? 'rgba(0,0,0,0.5)'
          : `rgba(0,0,0,${Math.max(0, 0.5 - (dragOffset / 600))})`,
        transition: dragging ? 'none' : 'background 250ms',
        display: isMobile ? 'block' : 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dividend details"
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTransitionEnd={handleTransitionEnd}
        style={isMobile ? {
          // Mobile: bottom sheet
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001,
          background: C.card,
          borderTopLeftRadius: 16, borderTopRightRadius: 16,
          border: `1px solid ${C.border}`, borderBottom: 'none',
          transform: mobileSheetTransform,
          transition: sheetTransition,
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
          maxHeight: '75vh', overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        } : {
          // Desktop: centered modal
          position: 'fixed', top: '50%', left: '50%', zIndex: 1001,
          background: C.card,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          transform: desktopModalTransform,
          transition: sheetTransition,
          opacity: open ? 1 : 0,
          width: '100%', maxWidth: 480,
          maxHeight: '70vh', overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Drag handle (mobile only) */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: C.textDim }} />
          </div>
        )}

        {/* Header */}
        <div style={{
          padding: isMobile ? '0 20px 16px' : '20px 24px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, color: C.text }}>{dateLabel}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              {(events || []).length} dividend event{(events || []).length !== 1 ? 's' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, fontFamily: MONO, color: C.green }}>
              ${dayTotal.toFixed(2)}
            </div>
            {/* Close button (desktop) */}
            {!isMobile && (
              <button
                onClick={handleClose}
                aria-label="Close"
                style={{
                  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: C.textMuted, fontSize: 16, padding: 0,
                  transition: 'background 0.15s',
                }}
              >
                &#10005;
              </button>
            )}
          </div>
        </div>

        {/* Events */}
        <div style={{
          padding: isMobile ? '0 20px 20px' : '0 24px 24px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {(events || []).map((ev, i) => (
            <div key={`${ev.ticker}-${i}`} style={{
              background: C.bg, borderRadius: 12, padding: isMobile ? '14px 16px' : '16px 20px',
              border: `1px solid ${C.border}`,
              animation: 'fadeSlideUp 0.3s ease-out both',
              animationDelay: `${i * 0.05}s`,
            }}>
              {/* Row 1: Ticker + Amount */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: isMobile ? 15 : 16, fontWeight: 700, fontFamily: MONO, color: C.text }}>
                    {ev.ticker}
                  </span>
                  <span style={badge(ev._isPaymentEntry ? C.cyan : C.amber)}>
                    {ev._isPaymentEntry ? 'Est. Pay' : 'Ex-Div'}
                  </span>
                  {ev.estimated && <span style={badge(C.textDim)}>Est.</span>}
                </div>
                <span style={{ fontSize: isMobile ? 16 : 17, fontWeight: 700, fontFamily: MONO, color: C.green }}>
                  +${(ev.estimated_income || 0).toFixed(2)}
                </span>
              </div>

              {/* Row 2: Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ background: C.card, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ ...labelStyle, fontSize: 9, marginBottom: 3 }}>Per Share</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.text }}>
                    ${(ev.amount_per_share || 0).toFixed(4)}
                  </div>
                </div>
                <div style={{ background: C.card, borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ ...labelStyle, fontSize: 9, marginBottom: 3 }}>Shares</div>
                  <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.text }}>
                    {(ev.shares_held || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Row 3: Estimated Payment Date */}
              {ev.estimated_payment_date && !ev._isPaymentEntry && (
                <div style={{
                  marginTop: 10, padding: '10px 12px', background: C.cyan + '0D',
                  borderRadius: 8, border: `1px solid ${C.cyan}22`,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth={2} strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span style={{ fontSize: 12, color: C.cyan, fontWeight: 600 }}>
                    Est. payment: {formatShortDate(ev.estimated_payment_date)}
                  </span>
                </div>
              )}

              {/* Account type */}
              {ev.account_type && (
                <div style={{ marginTop: 8, fontSize: 10, color: C.textDim }}>
                  {ev.account_type === '401k' ? '401k' : ev.account_type.charAt(0).toUpperCase() + ev.account_type.slice(1)} account
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ── Main Calendar Component ── */
export default function DividendCalendar({ accountFilter }) {
  const isMobile = useIsMobile();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDividendCalendar(currentMonth, accountFilter);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, accountFilter]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);
  useEffect(() => { setSelectedDay(null); }, [currentMonth]);

  const goToPrevMonth = () => {
    setCurrentMonth(prev => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => {
      const [y, m] = prev.split('-').map(Number);
      const d = new Date(y, m, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  };

  const { weeks, todayDay } = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const now = new Date();
    const isCurrentMonthNow = now.getFullYear() === y && now.getMonth() + 1 === m;
    const today = isCurrentMonthNow ? now.getDate() : -1;

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return { weeks: rows, todayDay: today };
  }, [currentMonth]);

  const eventsByDay = useMemo(() => {
    if (!data?.events) return {};
    const map = {};
    data.events.forEach(ev => {
      const exDay = parseInt(ev.date.split('-')[2], 10);
      if (!map[exDay]) map[exDay] = [];
      map[exDay].push(ev);

      if (ev.estimated_payment_date) {
        const payMonth = ev.estimated_payment_date.substring(0, 7);
        if (payMonth === data.month) {
          const payDay = parseInt(ev.estimated_payment_date.split('-')[2], 10);
          if (payDay !== exDay) {
            if (!map[payDay]) map[payDay] = [];
            map[payDay].push({ ...ev, _isPaymentEntry: true });
          }
        }
      }
    });
    return map;
  }, [data]);

  const isPastDay = useCallback((day) => {
    if (day === null) return false;
    const [y, m] = currentMonth.split('-').map(Number);
    const cellDate = new Date(y, m - 1, day);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return cellDate < now;
  }, [currentMonth]);

  const monthLabel = formatMonth(currentMonth);
  const eventDays = Object.keys(eventsByDay).length;

  const navBtnStyle = {
    ...buttonSecondary,
    padding: '6px 12px',
    fontSize: 16,
    lineHeight: 1,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <div style={{ ...cardStyle, padding: isMobile ? 16 : 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>
          Dividend Calendar
        </h3>
        {eventDays > 0 && (
          <span style={{ fontSize: 10, color: C.textDim }}>
            {eventDays} day{eventDays !== 1 ? 's' : ''} with events
          </span>
        )}
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button onClick={goToPrevMonth} aria-label="Previous month" style={navBtnStyle}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{monthLabel}</span>
        <button onClick={goToNextMonth} aria-label="Next month" style={navBtnStyle}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {loading ? (
        <SkeletonCard height={280} />
      ) : error ? (
        <InlineError message="Failed to load dividend calendar" onRetry={fetchCalendar} />
      ) : (
        <>
          {/* Day-of-week header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? 2 : 4, marginBottom: isMobile ? 2 : 4 }}>
            {DAYS.map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: isMobile ? 10 : 11, color: C.textDim,
                fontWeight: 600, padding: '6px 0',
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? 2 : 4 }}>
              {week.map((day, di) => (
                <DayCell
                  key={`${wi}-${di}`}
                  day={day}
                  isCurrentMonth={day !== null}
                  isToday={day === todayDay}
                  events={day !== null ? eventsByDay[day] : null}
                  isPastDay={day !== null && isPastDay(day)}
                  isSelected={day === selectedDay}
                  onSelect={setSelectedDay}
                  isMobile={isMobile}
                />
              ))}
            </div>
          ))}

          {/* Color legend */}
          <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.amber + '22', border: `1px solid ${C.amber}44` }} />
              Ex-Dividend
            </span>
            <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.cyan + '22', border: `1px solid ${C.cyan}44` }} />
              Est. Payment
            </span>
            <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.textDim + '18', border: `1px solid ${C.textDim}44` }} />
              Past
            </span>
          </div>

          {/* Monthly total */}
          <div style={{
            marginTop: 14, padding: '14px 16px', background: C.bg, borderRadius: 10,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>
                Estimated {monthLabel} Dividends
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.green }}>
                ${(data?.total_estimated_income || 0).toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {data?.annual_income_estimate > 0 && (
                <div>
                  <div style={{ ...labelStyle, fontSize: 9, marginBottom: 1 }}>Annual Est.</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.green }}>
                    ${data.annual_income_estimate.toFixed(2)}
                  </div>
                </div>
              )}
              {data?.daily_income_estimate > 0 && (
                <div>
                  <div style={{ ...labelStyle, fontSize: 9, marginBottom: 1 }}>Daily Est.</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.green }}>
                    ${data.daily_income_estimate.toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {data?.events?.some(e => e.estimated) && (
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 8, fontStyle: 'italic' }}>
              * Italic entries are estimated based on historical patterns. Payment dates are approximate.
            </div>
          )}
        </>
      )}

      {/* Day Detail Sheet/Modal */}
      <DayDetailSheet
        isOpen={selectedDay !== null}
        onClose={() => setSelectedDay(null)}
        day={selectedDay}
        month={currentMonth}
        events={selectedDay !== null ? (eventsByDay[selectedDay] || []) : []}
        isMobile={isMobile}
      />
    </div>
  );
}
