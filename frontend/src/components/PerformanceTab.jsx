import { useState } from 'react';
import { C } from '../styles/theme';
import PerformanceReturnsSection from './PerformanceReturnsSection';
import DividendIncomeSection from './DividendIncomeSection';
import DividendCalendarSection from './DividendCalendarSection';
import DividendEventsTimeline from './DividendEventsTimeline';
import ErrorBoundary from './ErrorBoundary';

const SUB_TABS = [
  { id: 'returns', label: 'Returns' },
  { id: 'income', label: 'Income' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'events', label: 'Events' },
];

export default function PerformanceTab({ holdings, accountFilter }) {
  const [activeSubTab, setActiveSubTab] = useState('returns');

  return (
    <div>
      {/* Sub-tab pills */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 16,
        background: C.bg, borderRadius: 8, padding: 3,
        border: `1px solid ${C.border}`, width: 'fit-content',
      }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeSubTab === tab.id ? C.accent : 'transparent',
              color: activeSubTab === tab.id ? '#fff' : C.textMuted,
              transition: 'background 0.15s, color 0.15s', minHeight: 44,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'returns' && (
        <ErrorBoundary fallbackMessage="Returns section encountered an error.">
          <PerformanceReturnsSection holdings={holdings} accountFilter={accountFilter} />
        </ErrorBoundary>
      )}
      {activeSubTab === 'income' && (
        <ErrorBoundary fallbackMessage="Income section encountered an error.">
          <DividendIncomeSection accountFilter={accountFilter} />
        </ErrorBoundary>
      )}
      {activeSubTab === 'calendar' && (
        <ErrorBoundary fallbackMessage="Calendar section encountered an error.">
          <DividendCalendarSection accountFilter={accountFilter} />
        </ErrorBoundary>
      )}
      {activeSubTab === 'events' && (
        <ErrorBoundary fallbackMessage="Events section encountered an error.">
          <DividendEventsTimeline accountFilter={accountFilter} />
        </ErrorBoundary>
      )}
    </div>
  );
}
