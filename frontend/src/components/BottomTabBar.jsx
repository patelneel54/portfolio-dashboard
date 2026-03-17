import { useState } from 'react';
import { C } from '../styles/theme';

const Icon = ({ paths, color = C.textMuted, size = 22 }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {paths.map((d, i) => <path key={i} d={d} />)}
  </svg>
);

const CircleIcon = ({ r, cx, cy, color, extra }) => (
  <svg aria-hidden="true" focusable="false" width={22} height={22} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx={cx} cy={cy} r={r} />
    {extra}
  </svg>
);

const ICONS = {
  chartBar: ['M12 20V10', 'M18 20V4', 'M6 20V16'],
  pieChart: ['M21.21 15.89A10 10 0 1 1 8 2.83', 'M22 12A10 10 0 0 0 12 2v10z'],
  trendingUp: ['M23 6l-9.5 9.5-5-5L1 18', 'M17 6h6v6'],
  target: ['M12 2a10 10 0 1 0 10 10', 'M12 8a4 4 0 1 0 4 4', 'M12 12h.01'],
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  bookOpen: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  globe: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z'],
  crosshair: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M22 12h-4', 'M6 12H2', 'M12 6V2', 'M12 22v-4'],
  more: ['M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
  sliders: ['M4 21V14', 'M4 10V3', 'M12 21V12', 'M12 8V3', 'M20 21V16', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
};

export const STOCK_TABS = [
  { id: 'overview', label: 'Overview', icon: 'chartBar' },
  { id: 'allocation', label: 'Allocation', icon: 'pieChart' },
  { id: 'performance', label: 'Performance', icon: 'trendingUp' },
  { id: 'projection', label: 'Projections', icon: 'target' },
];

export const STOCK_OVERFLOW = [
  { id: 'technicals', label: 'Technicals', icon: 'activity' },
  { id: 'options', label: 'Options', icon: 'sliders' },
];

export const CRYPTO_PRIMARY = [
  { id: 'overview', label: 'Overview', icon: 'chartBar' },
  { id: 'positions', label: 'Positions', icon: 'layers' },
  { id: 'journal', label: 'Journal', icon: 'bookOpen' },
  { id: 'risk', label: 'Risk', icon: 'shield' },
];

export const CRYPTO_OVERFLOW = [
  { id: 'market', label: 'Market', icon: 'globe' },
  { id: 'scanner', label: 'Scanner', icon: 'crosshair' },
];

export default function BottomTabBar({ activeTab, onTabChange, accountFilter }) {
  const [showMore, setShowMore] = useState(false);

  const isCrypto = accountFilter === 'crypto';
  const accentColor = isCrypto ? '#F7931A' : C.accent;
  const primaryTabs = isCrypto ? CRYPTO_PRIMARY : STOCK_TABS;
  const overflowTabs = isCrypto ? CRYPTO_OVERFLOW : STOCK_OVERFLOW;
  const overflowIds = overflowTabs.map(t => t.id);
  const isOverflowActive = overflowIds.includes(activeTab);

  const handleTabPress = (tabId) => {
    onTabChange(tabId);
    setShowMore(false);
  };

  const tabButtonStyle = (isActive) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: '6px 2px',
    gap: 2,
    minHeight: 44,
    WebkitTapHighlightColor: 'transparent',
    color: isActive ? accentColor : C.textMuted,
    transition: 'color 0.15s',
  });

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 900,
      background: C.card,
      borderTop: `1px solid ${C.border}`,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div role="tablist" aria-label="Dashboard navigation" style={{
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: 56,
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 4px',
        position: 'relative',
      }}>
        {primaryTabs.map(tab => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => handleTabPress(tab.id)}
            style={tabButtonStyle(activeTab === tab.id)}
          >
            <Icon paths={ICONS[tab.icon]} color={activeTab === tab.id ? accentColor : C.textMuted} />
            <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1, fontFamily: "'DM Sans', sans-serif" }}>{tab.label}</span>
          </button>
        ))}

        {overflowTabs.length > 0 && (
          <button
            onClick={() => setShowMore(prev => !prev)}
            aria-haspopup="true"
            aria-expanded={showMore}
            aria-label="More tabs"
            style={tabButtonStyle(isOverflowActive)}
          >
            <Icon paths={ICONS.more} color={isOverflowActive ? accentColor : C.textMuted} />
            <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1, fontFamily: "'DM Sans', sans-serif" }}>More</span>
          </button>
        )}

        {showMore && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 940 }}
              onClick={() => setShowMore(false)}
            />
            <div style={{
              position: 'absolute',
              bottom: '100%',
              right: 8,
              marginBottom: 8,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 6,
              minWidth: 160,
              zIndex: 950,
              boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
            }}>
              {overflowTabs.map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => handleTabPress(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '12px 14px',
                    border: 'none',
                    borderRadius: 8,
                    background: activeTab === tab.id ? accentColor + '22' : 'transparent',
                    color: activeTab === tab.id ? accentColor : C.textMuted,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <Icon paths={ICONS[tab.icon]} color={activeTab === tab.id ? accentColor : C.textMuted} size={20} />
                  {tab.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
