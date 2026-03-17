import { useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import CryptoOverview from './CryptoOverview';
import CryptoPositions from './CryptoPositions';
import CryptoTradeJournal from './CryptoTradeJournal';
import CryptoRiskDashboard from './CryptoRiskDashboard';
import CryptoMarketContext from './CryptoMarketContext';
import CryptoSetupScanner from './CryptoSetupScanner';

const CRYPTO_ACCENT = '#F7931A';

function CryptoStat({ label, value, sub, color }) {
  return (
    <div style={{
      padding: '16px 20px', background: C.card, borderRadius: 16,
      border: `1px solid ${C.border}`, minWidth: 140, flex: 1,
      borderTop: `2px solid ${color || CRYPTO_ACCENT}`,
    }}>
      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || C.text, marginTop: 4, fontFamily: MONO }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function displayCoin(ticker) {
  return (ticker || '').replace(/-USD$/, '');
}

export function fmtPrice(v) {
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

export function fmtK(v) {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
}

export default function CryptoView({ holdings, totalValue, activeTab }) {
  const cryptoHoldings = useMemo(() =>
    holdings.filter(h => h.type === 'Crypto'), [holdings]);

  const totalCryptoValue = useMemo(() =>
    cryptoHoldings.reduce((s, h) => s + (h.market_value || 0), 0), [cryptoHoldings]);

  const totalCryptoCost = useMemo(() =>
    cryptoHoldings.reduce((s, h) => s + (h.cost_basis || 0), 0), [cryptoHoldings]);

  const totalPL = totalCryptoValue - totalCryptoCost;
  const totalPLPct = totalCryptoCost ? ((totalCryptoValue - totalCryptoCost) / totalCryptoCost) * 100 : 0;

  const btcHolding = cryptoHoldings.find(h => displayCoin(h.ticker) === 'BTC');
  const btcDominance = btcHolding && totalCryptoValue
    ? ((btcHolding.market_value / totalCryptoValue) * 100).toFixed(1)
    : '0.0';

  const sortedHoldings = useMemo(() =>
    [...cryptoHoldings].sort((a, b) => (b.market_value || 0) - (a.market_value || 0)), [cryptoHoldings]);

  if (cryptoHoldings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#8383;</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Crypto Holdings</div>
        <div style={{ fontSize: 13 }}>Add your first crypto position using the Manage button above.</div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <CryptoOverview holdings={sortedHoldings} totalCryptoValue={totalCryptoValue} />;
      case 'positions':
        return <CryptoPositions holdings={sortedHoldings} totalCryptoValue={totalCryptoValue} totalCryptoCost={totalCryptoCost} />;
      case 'journal':
        return <CryptoTradeJournal holdings={sortedHoldings} />;
      case 'risk':
        return <CryptoRiskDashboard holdings={sortedHoldings} totalCryptoValue={totalCryptoValue} />;
      case 'market':
        return <CryptoMarketContext holdings={sortedHoldings} />;
      case 'scanner':
        return <CryptoSetupScanner holdings={sortedHoldings} />;
      default:
        return <CryptoOverview holdings={sortedHoldings} totalCryptoValue={totalCryptoValue} />;
    }
  };

  return (
    <div>
      {/* Crypto Header */}
      <div style={{
        background: `linear-gradient(135deg, ${C.card}, #1a1400)`,
        borderRadius: 16, border: `1px solid ${CRYPTO_ACCENT}33`,
        padding: '16px 24px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: CRYPTO_ACCENT }}>&#8383;</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Crypto Portfolio</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <CryptoStat label="Total Value" value={fmtK(totalCryptoValue)} sub={`Cost: ${fmtK(totalCryptoCost)}`} color={CRYPTO_ACCENT} />
          <CryptoStat
            label="Total P&L"
            value={`${totalPL >= 0 ? '+' : ''}${fmtK(Math.abs(totalPL))}`}
            sub={`${totalPLPct >= 0 ? '+' : ''}${totalPLPct.toFixed(1)}%`}
            color={totalPL >= 0 ? C.green : C.red}
          />
          <CryptoStat label="BTC Dominance" value={`${btcDominance}%`} sub="of crypto portfolio" color={CRYPTO_ACCENT} />
          <CryptoStat label="Coins Held" value={cryptoHoldings.length} color={C.text} />
        </div>
      </div>

      {/* Tab Content */}
      {renderTabContent()}
    </div>
  );
}
