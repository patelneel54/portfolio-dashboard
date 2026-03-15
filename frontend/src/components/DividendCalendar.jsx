import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { api } from '../hooks/useApi';
import { cardStyle, buttonSecondary } from '../styles/shared';
import { InlineError } from './ErrorBoundary';
import { SkeletonCard } from './SkeletonLoader';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function DayCell({ day, isCurrentMonth, isToday, events, isPastDay }) {
  if (day === null) {
    return <div style={{ minHeight: 56, padding: 4, background: 'transparent' }} />;
  }
  return (
    <div style={{
      minHeight: 56,
      padding: 4,
      background: isToday ? C.accent + '11' : 'transparent',
      border: `1px solid ${isToday ? C.accent + '44' : C.border + '44'}`,
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{
        fontSize: 11,
        color: isCurrentMonth ? C.text : C.textMuted,
        fontWeight: isToday ? 700 : 400,
        marginBottom: 2,
      }}>
        {day}
      </div>
      {events && events.map((ev, i) => (
        <div key={i} style={{
          fontSize: 9,
          padding: '1px 3px',
          borderRadius: 3,
          marginBottom: 1,
          background: isPastDay
            ? C.textDim + '18'
            : ev.type === 'ex-dividend' ? C.amber + '22' : C.green + '22',
          color: isPastDay
            ? C.textDim
            : ev.type === 'ex-dividend' ? C.amber : C.green,
          fontFamily: MONO,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontStyle: ev.estimated ? 'italic' : 'normal',
        }}>
          {ev.ticker.replace('-USD', '')} {ev.type === 'ex-dividend' ? 'XD ' : ''}${ev.estimated_income.toFixed(2)}
        </div>
      ))}
    </div>
  );
}

export default function DividendCalendar({ accountFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

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
    const firstDay = new Date(y, m - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(y, m, 0).getDate();
    const now = new Date();
    const isCurrentMonthNow = now.getFullYear() === y && now.getMonth() + 1 === m;
    const today = isCurrentMonthNow ? now.getDate() : -1;

    const cells = [];
    // Leading empty cells
    for (let i = 0; i < firstDay; i++) cells.push(null);
    // Days of month
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Trailing empty cells to fill last row
    while (cells.length % 7 !== 0) cells.push(null);

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }

    return { weeks: rows, todayDay: today };
  }, [currentMonth]);

  const eventsByDay = useMemo(() => {
    if (!data?.events) return {};
    const map = {};
    data.events.forEach(ev => {
      const day = parseInt(ev.date.split('-')[2], 10);
      if (!map[day]) map[day] = [];
      map[day].push(ev);
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

  const navBtnStyle = {
    ...buttonSecondary,
    padding: '6px 12px',
    fontSize: 16,
    lineHeight: 1,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>
        Dividend Calendar
      </h3>

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 1 }}>
            {DAYS.map(d => (
              <div key={d} style={{
                textAlign: 'center', fontSize: 10, color: C.textDim,
                fontWeight: 600, padding: '6px 0',
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
              {week.map((day, di) => (
                <DayCell
                  key={`${wi}-${di}`}
                  day={day}
                  isCurrentMonth={day !== null}
                  isToday={day === todayDay}
                  events={day !== null ? eventsByDay[day] : null}
                  isPastDay={day !== null && isPastDay(day)}
                />
              ))}
            </div>
          ))}

          {/* Color legend */}
          <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.green + '22', border: `1px solid ${C.green}44` }} />
              Payment
            </span>
            <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.amber + '22', border: `1px solid ${C.amber}44` }} />
              Ex-Dividend
            </span>
            <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: C.textDim + '18', border: `1px solid ${C.textDim}44` }} />
              Past
            </span>
          </div>

          {/* Monthly total */}
          <div style={{
            marginTop: 14, padding: '12px 14px', background: C.bg, borderRadius: 8,
            border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>
              Estimated {monthLabel} Dividends
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: C.green }}>
              ${(data?.total_estimated_income || 0).toFixed(2)}
            </span>
          </div>

          {data?.events?.some(e => e.estimated) && (
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 8, fontStyle: 'italic' }}>
              * Italic entries are estimated based on historical payment patterns.
            </div>
          )}
        </>
      )}
    </div>
  );
}
