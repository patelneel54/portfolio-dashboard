import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi';
import { C, MONO, SANS } from '../styles/theme';
import useReducedMotion from '../hooks/useReducedMotion';
import { cardStyle, buttonPrimary, buttonSecondary, labelStyle, srOnly } from '../styles/shared';
import OverviewTab from './OverviewTab';
import AllocationTab from './AllocationTab';
import PerformanceTab from './PerformanceTab';
import ProjectionTab from './ProjectionTab';
import TechnicalsTab from './TechnicalsTab';
import OptionsTab from './OptionsTab';
import BondsTab from './BondsTab';
import ManageHoldings from './ManageHoldings';
import CryptoView from './CryptoView';
import ErrorBoundary from './ErrorBoundary';
import BottomTabBar, { STOCK_TABS, STOCK_OVERFLOW, CRYPTO_PRIMARY, CRYPTO_OVERFLOW } from './BottomTabBar';
import SwipeContainer from './SwipeContainer';
import AccountFilterSheet from './AccountFilterSheet';
import SkeletonLoader from './SkeletonLoader';
import PullToRefresh from './PullToRefresh';
import { haptic } from '../utils/haptics';
import { isPushSupported, isSubscribed, subscribeToPush } from '../utils/pushNotifications';

function formatRefreshTime(date) {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  if (diffMin < 2) return 'Updated just now';
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  if (diffHr < 24) return `Updated ${diffHr}h ago`;
  return `Prices as of ${date.toLocaleString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric',
  })}`;
}

const Stat = ({ label, value, sub, color, index }) => {
  const reduced = useReducedMotion();
  return (
    <div style={{
      ...cardStyle,
      padding: '14px 18px',
      minWidth: 0,
      flex: 1,
      animation: reduced ? 'none' : 'fadeSlideUp 0.35s ease-out both',
      animationDelay: reduced ? '0s' : `${(index || 0) * 0.07}s`,
    }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || C.text, marginTop: 3, fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
};

/** @returns {JSX.Element} Main dashboard with tabs, stats, alerts banner, and holdings management. */
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  const [accountFilter, setAccountFilter] = useState('brokerage');
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const [holdingsData, settingsData, accountsData] = await Promise.all([
        api.getHoldings(),
        api.getSettings(),
        api.listAccounts().catch(() => []),
      ]);
      setData(holdingsData);
      setSettings(settingsData);
      setAccounts(accountsData || []);
      const serverTs = holdingsData.last_refreshed;
      setLastRefreshedAt(serverTs ? new Date(serverTs + 'Z') : new Date());
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setFetchError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch triggered alerts after data loads/refreshes
  useEffect(() => {
    if (data) {
      api.getAlerts(true).then(setTriggeredAlerts).catch(() => {});
      // Show push prompt if supported but not subscribed and not dismissed
      if (isPushSupported() && !localStorage.getItem('push_prompt_dismissed')) {
        isSubscribed().then(sub => { if (!sub) setShowPushPrompt(true); });
      }
    }
  }, [data]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      const msg = event.data;
      if (msg?.type === 'API_UPDATED') fetchData();
      if (msg?.type === 'API_CACHED_AT' && msg.cachedAt)
        setLastRefreshedAt(new Date(msg.cachedAt));
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [fetchData]);

  // Refetch when Settings saves new assumptions so Projections picks them up.
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('settings-updated', handler);
    return () => window.removeEventListener('settings-updated', handler);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshPrices();
      await fetchData();
      haptic();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return <SkeletonLoader />;
  }

  if (fetchError && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: C.red }}>&#9888;</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>Failed to load portfolio data</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>Check your connection and try again.</div>
          <button onClick={() => { setLoading(true); fetchData(); }} style={{ background: C.red + '22', border: `1px solid ${C.red}`, color: C.red, padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const allHoldings = data?.holdings || [];
  const byCategory = accountFilter === 'all'
    ? allHoldings
    : allHoldings.filter(h => (h.account_type || 'brokerage') === accountFilter);
  const filteredHoldings = activeAccountId != null
    ? byCategory.filter(h => h.account_id === activeAccountId)
    : byCategory;
  const activeAccount = activeAccountId != null
    ? accounts.find(a => a.id === activeAccountId)
    : null;

  // Recompute aggregates from filtered holdings
  const totalValue = filteredHoldings.reduce((s, h) => s + h.market_value, 0);
  const totalCost = filteredHoldings.reduce((s, h) => s + h.cost_basis, 0);
  const totalGL = totalValue - totalCost;
  const totalGLPct = totalCost ? ((totalValue - totalCost) / totalCost) * 100 : 0;

  // Recompute actual_allocation and drift relative to filtered total
  // Drift/target only applies to brokerage (actively managed)
  const holdings = filteredHoldings.map(h => {
    const actualAllocation = totalValue ? (h.market_value / totalValue) * 100 : 0;
    const isBrokerage = (h.account_type || 'brokerage') === 'brokerage';
    return {
      ...h,
      actual_allocation: Math.round(actualAllocation * 100) / 100,
      drift: isBrokerage ? Math.round((actualAllocation - h.target_allocation) * 100) / 100 : 0,
    };
  });
  const etfTotal = holdings.filter(h => h.type === 'ETF' || h.type === 'Fund').reduce((s, h) => s + h.market_value, 0);
  const stockTotal = holdings.filter(h => h.type === 'Stock').reduce((s, h) => s + h.market_value, 0);
  const cryptoTotal = holdings.filter(h => h.type === 'Crypto').reduce((s, h) => s + h.market_value, 0);

  const fmtK = (v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
  const isStale = lastRefreshedAt && (Date.now() - lastRefreshedAt.getTime() > 24 * 60 * 60 * 1000);
  const tabOrder = accountFilter === 'crypto'
    ? [...CRYPTO_PRIMARY, ...CRYPTO_OVERFLOW].map(t => t.id)
    : [...STOCK_TABS, ...STOCK_OVERFLOW].map(t => t.id);

  return (
    <PullToRefresh onRefresh={handleRefresh} refreshing={refreshing}>
    <div style={{ padding: '16px 12px', maxWidth: 1200, margin: '0 auto', paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.5, background: `linear-gradient(135deg, ${C.text}, ${C.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Portfolio Command Center
          </h1>
          <p style={{ color: C.textMuted, fontSize: 12, margin: '2px 0 0' }}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          {lastRefreshedAt && (
            <p style={{ color: isStale ? C.amber : C.textMuted, fontSize: 11, margin: '1px 0 0', fontWeight: isStale ? 600 : 400 }}>
              {formatRefreshTime(lastRefreshedAt)}
            </p>
          )}
          <button
            onClick={() => setShowFilterSheet(true)}
            aria-label="Filter by account"
            aria-haspopup="dialog"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 6, padding: '6px 12px', minHeight: 44,
              background: C.accent + '18', border: `1px solid ${C.accent}44`,
              borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: C.accent, transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
          >
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: 4,
              background: accountFilter === 'all' ? C.accent : accountFilter === 'brokerage' ? C.blue : accountFilter === '401k' ? C.purple : '#F7931A',
            }} />
            {activeAccount ? activeAccount.name : accountFilter === 'all' ? 'All Accounts' : accountFilter === 'brokerage' ? 'Brokerage' : accountFilter === '401k' ? '401k' : 'Crypto'}
            <svg aria-hidden="true" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
<button onClick={handleRefresh} disabled={refreshing} aria-label="Refresh prices" aria-busy={refreshing} style={{ ...buttonSecondary, borderRadius: 6, opacity: refreshing ? 0.5 : 1 }}>
            {refreshing ? '...' : 'Refresh'}
          </button>
          <button onClick={() => setShowManage(true)} style={{ ...buttonSecondary, borderRadius: 6, background: C.accent + '22', border: `1px solid ${C.accent}`, color: C.accent }}>
            Manage
          </button>
          <button onClick={() => navigate('/settings')} aria-label="Open settings" style={{ ...buttonSecondary, borderRadius: 6 }}>
            Settings
          </button>
        </div>
      </div>

      {/* Push Notification Prompt */}
      {showPushPrompt && (
        <div style={{
          background: C.accent + '14', border: `1px solid ${C.accent}33`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          animation: 'fadeSlideUp 0.3s ease-out',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>Enable Notifications</div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>Get alerts when your stocks hit price targets</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={async () => {
                const result = await subscribeToPush();
                if (result.success) {
                  setShowPushPrompt(false);
                  localStorage.setItem('push_prompt_dismissed', '1');
                }
              }}
              style={{
                background: C.accent, color: '#fff', border: 'none',
                borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', minHeight: 44,
              }}
            >
              Enable
            </button>
            <button
              onClick={() => { setShowPushPrompt(false); localStorage.setItem('push_prompt_dismissed', '1'); }}
              style={{
                background: 'none', border: 'none', color: C.textDim,
                cursor: 'pointer', padding: '6px 8px', fontSize: 11, minHeight: 44,
              }}
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* Triggered Alerts Banner */}
      {triggeredAlerts.length > 0 && (
        <div role="alert" style={{
          background: C.amber + '18', border: `1px solid ${C.amber}44`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.amber }}>
            {triggeredAlerts.length} alert{triggeredAlerts.length > 1 ? 's' : ''} triggered
          </span>
          <button
            onClick={async () => {
              await Promise.all(triggeredAlerts.map(a => api.dismissAlert(a.id)));
              setTriggeredAlerts([]);
            }}
            style={{
              background: 'none', border: `1px solid ${C.amber}44`, color: C.amber,
              borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', minHeight: 44,
            }}
          >
            Dismiss All
          </button>
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        <Stat index={0} label="Total Value" value={fmtK(totalValue)} sub={`Cost: ${fmtK(totalCost)}`} />
        <Stat index={1} label="Total Gain" value={<>{totalGL >= 0 ? '+' : ''}{fmtK(Math.abs(totalGL))}<span style={srOnly}>{totalGL >= 0 ? ' gain' : ' loss'}</span></>} sub={`${totalGLPct >= 0 ? '+' : ''}${totalGLPct.toFixed(1)}% return`} color={totalGL >= 0 ? C.green : C.red} />
        <Stat index={2} label="Funds / Stock" value={`${totalValue ? ((etfTotal / totalValue) * 100).toFixed(0) : 0}% / ${totalValue ? ((stockTotal / totalValue) * 100).toFixed(0) : 0}%${cryptoTotal ? ' / ' + (totalValue ? ((cryptoTotal / totalValue) * 100).toFixed(0) : 0) + '%' : ''}`} sub={`${fmtK(etfTotal)} / ${fmtK(stockTotal)}${cryptoTotal ? ' / ' + fmtK(cryptoTotal) : ''}`} color={C.blue} />
        <Stat index={3} label="Positions" value={holdings.length} sub={`${holdings.filter(h => h.type === 'ETF' || h.type === 'Fund').length} ETFs/Funds \u2022 ${holdings.filter(h => h.type === 'Stock').length} Stocks${holdings.filter(h => h.type === 'Crypto').length ? ' \u2022 ' + holdings.filter(h => h.type === 'Crypto').length + ' Crypto' : ''}`} color={C.purple} />
      </div>

      {/* Tab Content */}
      {holdings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128188;</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Holdings Yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Add your first stock or ETF to get started.</div>
          <button onClick={() => setShowManage(true)} style={{ ...buttonPrimary, padding: '10px 24px' }}>
            Add Holdings
          </button>
        </div>
      ) : (
        <SwipeContainer tabs={tabOrder} activeTab={activeTab} onTabChange={(tab) => { haptic(); setActiveTab(tab); }}>
          {accountFilter === 'crypto' ? (
            <div key={activeTab} role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
              <ErrorBoundary fallbackMessage="Crypto view encountered an error.">
                <CryptoView holdings={holdings} totalValue={totalValue} activeTab={activeTab} />
              </ErrorBoundary>
            </div>
          ) : (
            <div key={activeTab} role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
              {activeTab === 'overview' && <ErrorBoundary key="overview" fallbackMessage="Overview tab encountered an error."><OverviewTab holdings={holdings} totalValue={totalValue} accountFilter={accountFilter} /></ErrorBoundary>}
              {activeTab === 'allocation' && <ErrorBoundary key="allocation" fallbackMessage="Allocation tab encountered an error."><AllocationTab holdings={holdings} totalValue={totalValue} settings={settings} accountFilter={accountFilter} /></ErrorBoundary>}
              {activeTab === 'performance' && <ErrorBoundary key="performance" fallbackMessage="Performance tab encountered an error."><PerformanceTab holdings={holdings} accountFilter={accountFilter} /></ErrorBoundary>}
              {activeTab === 'projection' && <ErrorBoundary key="projection" fallbackMessage="Projections tab encountered an error."><ProjectionTab totalValue={totalValue} settings={settings} accountFilter={accountFilter} /></ErrorBoundary>}
              {activeTab === 'technicals' && <ErrorBoundary key="technicals" fallbackMessage="Technicals tab encountered an error."><TechnicalsTab holdings={holdings} /></ErrorBoundary>}
              {activeTab === 'options' && <ErrorBoundary key="options" fallbackMessage="Options simulator encountered an error."><OptionsTab holdings={holdings} /></ErrorBoundary>}
              {activeTab === 'bonds' && <ErrorBoundary key="bonds" fallbackMessage="Bond analysis encountered an error."><BondsTab holdings={holdings} /></ErrorBoundary>}
            </div>
          )}
        </SwipeContainer>
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, padding: '16px 0', borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textDim, textAlign: 'center' }}>
        Technical levels are approximate. Not financial advice. Prices refresh daily at market close.
      </div>

      {/* Manage Holdings Modal */}
      {showManage && <ManageHoldings holdings={allHoldings} accounts={accounts} onClose={() => setShowManage(false)} onUpdate={fetchData} accountFilter={accountFilter} activeAccountId={activeAccountId} />}

      <AccountFilterSheet
        isOpen={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        accountFilter={accountFilter}
        activeAccountId={activeAccountId}
        accounts={accounts}
        onSelect={(id) => { setAccountFilter(id); setActiveAccountId(null); setActiveTab('overview'); }}
        onSelectAccount={(acct) => { setAccountFilter(acct.account_type); setActiveAccountId(acct.id); setActiveTab('overview'); }}
      />

      <BottomTabBar activeTab={activeTab} onTabChange={(tab) => { haptic(); setActiveTab(tab); }} accountFilter={accountFilter} />
    </div>
    </PullToRefresh>
  );
}
