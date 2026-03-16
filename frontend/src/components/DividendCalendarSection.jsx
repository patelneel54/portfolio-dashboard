import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { cardStyle, badge } from '../styles/shared';
import { api } from '../hooks/useApi';
import DividendCalendar from './DividendCalendar';
import { SkeletonCard } from './SkeletonLoader';

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPrevMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DividendCalendarSection({ accountFilter }) {
  const [currentData, setCurrentData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [loading, setLoading] = useState(true);

  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const prevMonth = useMemo(() => getPrevMonth(currentMonth), [currentMonth]);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    try {
      const [cur, prev] = await Promise.all([
        api.getDividendCalendar(currentMonth, accountFilter),
        api.getDividendCalendar(prevMonth, accountFilter),
      ]);
      setCurrentData(cur);
      setPrevData(prev);
    } catch {
      // Non-critical — comparison strip just won't show
    } finally {
      setLoading(false);
    }
  }, [currentMonth, prevMonth, accountFilter]);

  useEffect(() => { fetchComparison(); }, [fetchComparison]);

  const curTotal = currentData?.total_estimated_income || 0;
  const prevTotal = prevData?.total_estimated_income || 0;
  const delta = prevTotal ? ((curTotal - prevTotal) / prevTotal) * 100 : 0;

  const today = new Date().toISOString().split('T')[0];
  const upcomingEvents = useMemo(() => {
    if (!currentData?.events) return [];
    return currentData.events
      .filter(ev => ev.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10);
  }, [currentData, today]);

  const curMonthLabel = new Date(currentMonth + '-01').toLocaleString('en-US', { month: 'long' });
  const prevMonthLabel = new Date(prevMonth + '-01').toLocaleString('en-US', { month: 'short' });

  return (
    <div>
      {/* Month Comparison Strip */}
      {!loading && (curTotal > 0 || prevTotal > 0) && (
        <div style={{
          ...cardStyle, padding: '12px 16px', marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {curMonthLabel}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.green }}>
                ${curTotal.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {prevMonthLabel}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.textMuted }}>
                ${prevTotal.toFixed(2)}
              </div>
            </div>
          </div>
          {prevTotal > 0 && (
            <div style={{
              fontSize: 14, fontWeight: 700, fontFamily: MONO,
              color: delta >= 0 ? C.green : C.red,
            }}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
            </div>
          )}
        </div>
      )}

      {loading && <SkeletonCard height={60} style={{ marginBottom: 16 }} />}

      {/* Existing Calendar */}
      <DividendCalendar accountFilter={accountFilter} />

      {/* Upcoming Events List */}
      {upcomingEvents.length > 0 && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>
            Upcoming Events
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcomingEvents.map((ev, i) => {
              const isPayment = ev.type === 'payment';
              const evColor = isPayment ? C.green : C.amber;
              const dateLabel = new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <div key={`${ev.ticker}-${ev.date}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: C.bg, borderRadius: 8,
                  border: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: 12, color: C.textMuted, fontFamily: MONO, minWidth: 50, fontWeight: 600 }}>
                    {dateLabel}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: C.text, minWidth: 50 }}>
                    {ev.ticker}
                  </span>
                  <span style={badge(evColor)}>
                    {isPayment ? 'Payment' : 'Ex-Div'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontFamily: MONO, fontWeight: 700, fontSize: 13, color: evColor }}>
                    ${ev.estimated_income.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
