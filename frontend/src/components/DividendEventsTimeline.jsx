import { useState, useEffect, useCallback, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { cardStyle, badge } from '../styles/shared';
import { api } from '../hooks/useApi';
import { SkeletonCard } from './SkeletonLoader';
import { InlineError } from './ErrorBoundary';

const FILTERS = [
  { id: 'all', label: 'All Events' },
  { id: 'payment', label: 'Payments' },
  { id: 'ex-dividend', label: 'Ex-Dates' },
];

export default function DividendEventsTimeline({ accountFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both dividend history and current+prev month calendars for event details
      const now = new Date();
      const months = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      const results = await Promise.all(
        months.map(m => api.getDividendCalendar(m, accountFilter).catch(() => null))
      );

      const allEvents = [];
      results.forEach(r => {
        if (r?.events) {
          r.events.forEach(ev => {
            allEvents.push(ev);
          });
        }
      });

      // Deduplicate by ticker+date+type
      const seen = new Set();
      const unique = allEvents.filter(ev => {
        const key = `${ev.ticker}:${ev.date}:${ev.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      unique.sort((a, b) => b.date.localeCompare(a.date));
      setData(unique);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const today = new Date().toISOString().split('T')[0];

  const filteredEvents = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data;
    return data.filter(ev => ev.type === filter);
  }, [data, filter]);

  const groupedByMonth = useMemo(() => {
    const groups = {};
    filteredEvents.forEach(ev => {
      const mk = ev.date.substring(0, 7);
      if (!groups[mk]) groups[mk] = [];
      groups[mk].push(ev);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, events]) => ({
        month,
        label: new Date(month + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        events,
        total: events.filter(e => e.type === 'payment').reduce((s, e) => s + (e.estimated_income || 0), 0),
      }));
  }, [filteredEvents]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1, 2, 3].map(i => <SkeletonCard key={i} height={80} />)}
      </div>
    );
  }

  if (error) {
    return <InlineError message="Failed to load events" onRetry={fetchData} />;
  }

  if (!data || data.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={{ color: C.textDim, fontSize: 12 }}>No dividend events found.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 12px', borderRadius: 6,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: filter === f.id ? C.accent + '22' : C.card,
              color: filter === f.id ? C.accent : C.textMuted,
              border: `1px solid ${filter === f.id ? C.accent : C.border}`,
              minHeight: 44, transition: 'background 0.15s, color 0.15s, border-color 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {groupedByMonth.map(group => (
        <div key={group.month} style={{ marginBottom: 20 }}>
          {/* Month Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0', marginBottom: 8,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{group.label}</span>
            {group.total > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: C.green }}>
                ${group.total.toFixed(2)}
              </span>
            )}
          </div>

          {/* Events */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {group.events.map((ev, i) => {
              const isPast = ev.date < today;
              const isPayment = ev.type === 'payment';
              const evColor = isPayment ? C.green : C.amber;
              const dateLabel = new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <div key={`${ev.ticker}-${ev.date}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: C.card, borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  opacity: isPast ? 0.55 : 1,
                  borderLeft: `3px solid ${ev.estimated ? C.textDim : evColor}`,
                  fontStyle: ev.estimated ? 'italic' : 'normal',
                }}>
                  <span style={{ fontSize: 11, color: C.textMuted, fontFamily: MONO, minWidth: 48, fontWeight: 600 }}>
                    {dateLabel}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: C.text, minWidth: 50 }}>
                    {ev.ticker}
                  </span>
                  <span style={badge(evColor)}>
                    {isPayment ? 'Payment' : 'Ex-Div'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontFamily: MONO, fontWeight: 700, fontSize: 13, color: evColor }}>
                    {isPayment ? '+' : ''}${(ev.estimated_income || 0).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
