import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import OverviewTab from './OverviewTab';
import AllocationTab from './AllocationTab';
import PerformanceTab from './PerformanceTab';
import ProjectionTab from './ProjectionTab';
import TechnicalsTab from './TechnicalsTab';
import ManageHoldings from './ManageHoldings';
import CryptoView from './CryptoView';

const STOCK_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'allocation', label: 'Allocation' },
  { id: 'performance', label: 'Performance' },
  { id: 'projection', label: 'Projections' },
  { id: 'technicals', label: 'Technicals' },
];

const CRYPTO_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'positions', label: 'Positions' },
  { id: 'journal', label: 'Trade Journal' },
  { id: 'risk', label: 'Risk' },
  { id: 'market', label: 'Market' },
  { id: 'scanner', label: 'Scanner' },
];

const Stat = ({ label, value, sub, color }) => (
  <div style={{ padding: '12px 14px', background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, minWidth: 0, flex: 1 }}>
    <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: color || C.text, marginTop: 3, fontFamily: MONO }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
  </div>
);

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [accountFilter, setAccountFilter] = useState('all');
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      const [holdingsData, settingsData] = await Promise.all([
        api.getHoldings(),
        api.getSettings(),
      ]);
      setData(holdingsData);
      setSettings(settingsData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshPrices();
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>&#128200;</div>
          <div style={{ color: C.textMuted, fontSize: 14 }}>Loading portfolio...</div>
        </div>
      </div>
    );
  }

  const allHoldings = data?.holdings || [];
  const filteredHoldings = accountFilter === 'all'
    ? allHoldings
    : allHoldings.filter(h => (h.account_type || 'brokerage') === accountFilter);

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

  return (
    <div style={{ padding: '16px 12px', maxWidth: 1200, margin: '0 auto', paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.5, background: `linear-gradient(135deg, ${C.text}, ${C.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Portfolio Command Center
          </h1>
          <p style={{ color: C.textMuted, fontSize: 12, margin: '2px 0 0' }}>
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <button onClick={() => setShowGuides(!showGuides)} style={{ background: showGuides ? C.accent + '22' : 'transparent', border: `1px solid ${showGuides ? C.accent : C.border}`, color: showGuides ? C.accent : C.textMuted, padding: '5px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
            {showGuides ? 'Guides' : 'Guides'}
          </button>
          <button onClick={handleRefresh} disabled={refreshing} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '5px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontWeight: 600, opacity: refreshing ? 0.5 : 1 }}>
            {refreshing ? '...' : 'Refresh'}
          </button>
          <button onClick={() => setShowManage(true)} style={{ background: C.accent + '22', border: `1px solid ${C.accent}`, color: C.accent, padding: '5px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
            Manage
          </button>
          <button onClick={() => navigate('/settings')} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '5px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
            Settings
          </button>
        </div>
      </div>

      {/* Account Filter */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 14, background: C.card, borderRadius: 10, padding: 3, border: `1px solid ${C.border}`, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {[
          { id: 'all', label: 'All' },
          { id: 'brokerage', label: 'Brokerage' },
          { id: '401k', label: '401k' },
          { id: 'crypto', label: 'Crypto' },
        ].map(opt => (
          <button
            key={opt.id}
            onClick={() => { setAccountFilter(opt.id); setActiveTab('overview'); }}
            style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', flex: '1 0 auto',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              background: accountFilter === opt.id ? C.accent : 'transparent',
              color: accountFilter === opt.id ? '#fff' : C.textMuted,
              transition: 'all 0.2s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
        <Stat label="Total Value" value={fmtK(totalValue)} sub={`Cost: ${fmtK(totalCost)}`} />
        <Stat label="Total Gain" value={`${totalGL >= 0 ? '+' : ''}${fmtK(Math.abs(totalGL))}`} sub={`${totalGLPct >= 0 ? '+' : ''}${totalGLPct.toFixed(1)}% return`} color={totalGL >= 0 ? C.green : C.red} />
        <Stat label="Funds / Stock" value={`${totalValue ? ((etfTotal / totalValue) * 100).toFixed(0) : 0}% / ${totalValue ? ((stockTotal / totalValue) * 100).toFixed(0) : 0}%${cryptoTotal ? ' / ' + (totalValue ? ((cryptoTotal / totalValue) * 100).toFixed(0) : 0) + '%' : ''}`} sub={`${fmtK(etfTotal)} / ${fmtK(stockTotal)}${cryptoTotal ? ' / ' + fmtK(cryptoTotal) : ''}`} color={C.blue} />
        <Stat label="Positions" value={holdings.length} sub={`${holdings.filter(h => h.type === 'ETF' || h.type === 'Fund').length} ETFs/Funds \u2022 ${holdings.filter(h => h.type === 'Stock').length} Stocks${holdings.filter(h => h.type === 'Crypto').length ? ' \u2022 ' + holdings.filter(h => h.type === 'Crypto').length + ' Crypto' : ''}`} color={C.purple} />
      </div>

      {/* Tab Bar */}
      {(() => {
        const tabs = accountFilter === 'crypto' ? CRYPTO_TABS : STOCK_TABS;
        const accentColor = accountFilter === 'crypto' ? '#F7931A' : C.accent;
        return (
          <div style={{ display: 'flex', gap: 3, marginBottom: 16, background: C.card, borderRadius: 10, padding: 3, border: `1px solid ${C.border}`, overflowX: 'auto', WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '8px 6px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 0,
                  background: activeTab === tab.id ? accentColor : 'transparent',
                  color: activeTab === tab.id ? '#fff' : C.textMuted,
                  transition: 'all 0.2s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Tab Content */}
      {holdings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128188;</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Holdings Yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Add your first stock or ETF to get started.</div>
          <button onClick={() => setShowManage(true)} style={{ background: C.accent, color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Add Holdings
          </button>
        </div>
      ) : accountFilter === 'crypto' ? (
        <CryptoView holdings={holdings} totalValue={totalValue} activeTab={activeTab} />
      ) : (
        <>
          {activeTab === 'overview' && <OverviewTab holdings={holdings} totalValue={totalValue} showGuides={showGuides} accountFilter={accountFilter} />}
          {activeTab === 'allocation' && <AllocationTab holdings={holdings} totalValue={totalValue} showGuides={showGuides} settings={settings} accountFilter={accountFilter} />}
          {activeTab === 'performance' && <PerformanceTab holdings={holdings} showGuides={showGuides} />}
          {activeTab === 'projection' && <ProjectionTab totalValue={totalValue} settings={settings} showGuides={showGuides} accountFilter={accountFilter} />}
          {activeTab === 'technicals' && <TechnicalsTab holdings={holdings} showGuides={showGuides} />}
        </>
      )}

      {/* Footer */}
      <div style={{ marginTop: 32, padding: '16px 0', borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textDim, textAlign: 'center' }}>
        Technical levels are approximate. Not financial advice. Prices refresh daily at market close.
      </div>

      {/* Manage Holdings Modal */}
      {showManage && <ManageHoldings holdings={allHoldings} onClose={() => setShowManage(false)} onUpdate={fetchData} accountFilter={accountFilter} />}
    </div>
  );
}
