import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import { displayCoin, fmtPrice } from './CryptoView';

const CRYPTO_ACCENT = '#F7931A';
const LS_RULES_KEY = 'crypto_scanner_rules';
const LS_WATCHLIST_KEY = 'crypto_watchlist';
const LS_SIGNAL_LOG_KEY = 'crypto_signal_log';

const DEFAULT_RULES = [
  { id: 'rsi_oversold', name: 'RSI Oversold', condition: 'RSI < 30', type: 'buy', enabled: true },
  { id: 'rsi_overbought', name: 'RSI Overbought', condition: 'RSI > 70', type: 'sell', enabled: true },
  { id: 'volume_spike', name: 'Volume Spike', condition: 'Vol > 2x Avg', type: 'attention', enabled: true },
  { id: 'golden_cross', name: 'Golden Cross', condition: '50MA > 200MA', type: 'buy', enabled: true },
  { id: 'death_cross', name: 'Death Cross', condition: '50MA < 200MA', type: 'sell', enabled: true },
  { id: 'resistance_break', name: 'Resistance Break', condition: 'Price > Resistance', type: 'buy', enabled: true },
  { id: 'support_break', name: 'Support Break', condition: 'Price < Support', type: 'sell', enabled: true },
];

function loadRules() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_RULES_KEY));
    if (saved?.length) return saved;
  } catch {}
  return DEFAULT_RULES;
}
function saveRules(rules) { localStorage.setItem(LS_RULES_KEY, JSON.stringify(rules)); }
function loadWatchlist() {
  try { return JSON.parse(localStorage.getItem(LS_WATCHLIST_KEY) || '[]'); } catch { return []; }
}
function saveWatchlist(wl) { localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(wl)); }
function loadSignalLog() {
  try { return JSON.parse(localStorage.getItem(LS_SIGNAL_LOG_KEY) || '[]'); } catch { return []; }
}
function saveSignalLog(log) { localStorage.setItem(LS_SIGNAL_LOG_KEY, JSON.stringify(log)); }

function evaluateRules(tech, rules) {
  if (!tech) return [];
  const signals = [];
  const enabledRules = rules.filter(r => r.enabled);

  for (const rule of enabledRules) {
    let triggered = false;
    let signal = '';
    let strength = 'Normal';

    switch (rule.id) {
      case 'rsi_oversold':
        if (tech.rsi != null && tech.rsi < 30) {
          triggered = true;
          signal = `RSI = ${tech.rsi.toFixed(1)}`;
          strength = tech.rsi < 20 ? 'Strong' : 'Normal';
        }
        break;
      case 'rsi_overbought':
        if (tech.rsi != null && tech.rsi > 70) {
          triggered = true;
          signal = `RSI = ${tech.rsi.toFixed(1)}`;
          strength = tech.rsi > 80 ? 'Strong' : 'Normal';
        }
        break;
      case 'volume_spike':
        if (tech.volume && tech.avg_volume_30 && tech.volume > 2 * tech.avg_volume_30) {
          triggered = true;
          signal = `Vol ${((tech.volume / tech.avg_volume_30) * 100).toFixed(0)}% of avg`;
          strength = tech.volume > 3 * tech.avg_volume_30 ? 'Strong' : 'Normal';
        }
        break;
      case 'golden_cross':
        if (tech.sma50 && tech.sma200 && tech.sma50 > tech.sma200) {
          triggered = true;
          signal = `50MA (${fmtPrice(tech.sma50)}) > 200MA (${fmtPrice(tech.sma200)})`;
          strength = (tech.sma50 - tech.sma200) / tech.sma200 > 0.05 ? 'Strong' : 'Weak';
        }
        break;
      case 'death_cross':
        if (tech.sma50 && tech.sma200 && tech.sma50 < tech.sma200) {
          triggered = true;
          signal = `50MA (${fmtPrice(tech.sma50)}) < 200MA (${fmtPrice(tech.sma200)})`;
          strength = (tech.sma200 - tech.sma50) / tech.sma200 > 0.05 ? 'Strong' : 'Weak';
        }
        break;
      case 'resistance_break':
        if (tech.price && tech.resistance?.[0] && tech.price > tech.resistance[0]) {
          triggered = true;
          signal = `Price > R1 (${fmtPrice(tech.resistance[0])})`;
          strength = 'Normal';
        }
        break;
      case 'support_break':
        if (tech.price && tech.support?.[0] && tech.price < tech.support[0]) {
          triggered = true;
          signal = `Price < S1 (${fmtPrice(tech.support[0])})`;
          strength = 'Normal';
        }
        break;
      default:
        break;
    }

    if (triggered) {
      signals.push({
        rule: rule.name,
        type: rule.type,
        signal,
        strength,
      });
    }
  }
  return signals;
}

const TYPE_COLORS = { buy: C.green, sell: C.red, attention: C.amber };
const TYPE_LABELS = { buy: 'Buy Signal', sell: 'Sell Signal', attention: 'Attention' };

export default function CryptoSetupScanner({ holdings }) {
  const [rules, setRules] = useState(loadRules);
  const [watchlist, setWatchlist] = useState(loadWatchlist);
  const [watchlistInput, setWatchlistInput] = useState('');
  const [signalLog, setSignalLog] = useState(loadSignalLog);
  const [techData, setTechData] = useState({});
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);

  const allTickers = useMemo(() => {
    const held = holdings.map(h => h.ticker);
    const wl = watchlist.map(w => w.endsWith('-USD') ? w : `${w}-USD`);
    return [...new Set([...held, ...wl])];
  }, [holdings, watchlist]);

  const runScan = useCallback(async () => {
    setScanning(true);
    const results = {};
    for (const ticker of allTickers) {
      try {
        results[ticker] = await api.getTechnicals(ticker);
      } catch {
        results[ticker] = null;
      }
    }
    setTechData(results);
    setLastScan(new Date());
    setScanning(false);

    // Log new signals
    const newSignals = [];
    const today = new Date().toISOString().split('T')[0];
    for (const ticker of allTickers) {
      const signals = evaluateRules(results[ticker], rules);
      signals.forEach(s => {
        newSignals.push({
          date: today,
          ticker,
          coin: displayCoin(ticker),
          rule: s.rule,
          signal: s.signal,
          type: s.type,
          price: results[ticker]?.price || 0,
        });
      });
    }
    if (newSignals.length > 0) {
      const updated = [...newSignals, ...signalLog].slice(0, 100); // keep last 100
      setSignalLog(updated);
      saveSignalLog(updated);
    }
  }, [allTickers, rules, signalLog]);

  useEffect(() => { runScan(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRule = (id) => {
    const next = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(next);
    saveRules(next);
  };

  const addToWatchlist = () => {
    const ticker = watchlistInput.toUpperCase().trim();
    if (!ticker || watchlist.includes(ticker)) return;
    const next = [...watchlist, ticker];
    setWatchlist(next);
    saveWatchlist(next);
    setWatchlistInput('');
  };

  const removeFromWatchlist = (ticker) => {
    const next = watchlist.filter(w => w !== ticker);
    setWatchlist(next);
    saveWatchlist(next);
  };

  // Build active setups
  const activeSetups = useMemo(() => {
    const setups = [];
    for (const ticker of allTickers) {
      const tech = techData[ticker];
      const signals = evaluateRules(tech, rules);
      const isHeld = holdings.some(h => h.ticker === ticker);
      signals.forEach(s => {
        setups.push({ ...s, ticker, coin: displayCoin(ticker), isHeld, price: tech?.price || 0 });
      });
    }
    return setups;
  }, [allTickers, techData, rules, holdings]);

  const heldSetups = activeSetups.filter(s => s.isHeld);
  const watchlistSetups = activeSetups.filter(s => !s.isHeld);

  return (
    <div>
      {/* Scan Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          {lastScan ? `Last scan: ${lastScan.toLocaleTimeString()}` : 'Ready to scan'}
          {activeSetups.length > 0 && <span style={{ color: CRYPTO_ACCENT, fontWeight: 700, marginLeft: 8 }}>{activeSetups.length} active signal{activeSetups.length !== 1 ? 's' : ''}</span>}
        </div>
        <button onClick={runScan} disabled={scanning} style={{
          padding: '10px 16px', borderRadius: 6, border: 'none',
          fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44,
          background: CRYPTO_ACCENT, color: '#fff', opacity: scanning ? 0.6 : 1,
        }}>
          {scanning ? 'Scanning...' : 'Scan Now'}
        </button>
      </div>

      {/* Section 1: Active Setups (Held Coins) */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Active Setups — Your Coins</h3>
        {heldSetups.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: C.textDim, fontSize: 12 }}>
            {scanning ? 'Scanning...' : 'No active setups detected for your holdings'}
          </div>
        ) : (
          <div data-no-swipe style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Coin', 'Setup', 'Signal', 'Strength', 'Action'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: C.textDim, fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heldSetups.map((s, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}22` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: MONO }}>{s.coin}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{s.rule}</td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO, fontSize: 11, color: C.textMuted }}>{s.signal}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: s.strength === 'Strong' ? C.green + '22' : s.strength === 'Weak' ? C.textDim + '22' : CRYPTO_ACCENT + '22', color: s.strength === 'Strong' ? C.green : s.strength === 'Weak' ? C.textDim : CRYPTO_ACCENT }}>
                        {s.strength}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: TYPE_COLORS[s.type] + '22', color: TYPE_COLORS[s.type] }}>
                        {TYPE_LABELS[s.type]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 16 }}>
        {/* Section 2: Setup Rules */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Setup Rules</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rules.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                background: r.enabled ? C.bg : 'transparent', borderRadius: 6,
                border: `1px solid ${r.enabled ? C.border : 'transparent'}`,
                opacity: r.enabled ? 1 : 0.5,
              }}>
                <button
                  onClick={() => toggleRule(r.id)}
                  style={{
                    width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                    background: r.enabled ? CRYPTO_ACCENT : C.border,
                    position: 'relative', padding: 0,
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                    left: r.enabled ? 21 : 3,
                  }} />
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: C.textDim }}>{r.condition}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: TYPE_COLORS[r.type] + '22', color: TYPE_COLORS[r.type], textTransform: 'uppercase' }}>
                  {r.type}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Watchlist */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Watchlist Scanner</h3>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              value={watchlistInput}
              onChange={e => setWatchlistInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addToWatchlist()}
              placeholder="Add coin (e.g. SOL)"
              style={{
                flex: 1, padding: '6px 10px', fontSize: 12, fontFamily: MONO,
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
                color: C.text, outline: 'none',
              }}
            />
            <button onClick={addToWatchlist} style={{
              padding: '10px 14px', borderRadius: 6, border: 'none',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44,
              background: CRYPTO_ACCENT, color: '#fff',
            }}>
              Add
            </button>
          </div>
          {watchlist.length === 0 ? (
            <div style={{ padding: 12, textAlign: 'center', color: C.textDim, fontSize: 11 }}>
              Add coins to your watchlist to scan for setups
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {watchlist.map(w => (
                <span key={w} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                  background: C.bg, borderRadius: 6, border: `1px solid ${C.border}`,
                  fontSize: 11, fontFamily: MONO, fontWeight: 600,
                }}>
                  {w}
                  <button onClick={() => removeFromWatchlist(w)} style={{
                    background: 'none', border: 'none', color: C.red, cursor: 'pointer',
                    fontSize: 14, padding: '8px 8px', lineHeight: 1, minWidth: 32, minHeight: 32,
                  }}>x</button>
                </span>
              ))}
            </div>
          )}
          {watchlistSetups.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: C.textDim, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Active Signals</div>
              {watchlistSetups.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 8px', borderRadius: 4, marginBottom: 4,
                  background: TYPE_COLORS[s.type] + '11', border: `1px solid ${TYPE_COLORS[s.type]}22`,
                }}>
                  <div>
                    <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12 }}>{s.coin}</span>
                    <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>{s.rule}</span>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: TYPE_COLORS[s.type], textTransform: 'uppercase' }}>{s.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Signal Log */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>Signal History</h3>
          {signalLog.length > 0 && (
            <button onClick={() => { setSignalLog([]); saveSignalLog([]); }} style={{
              padding: '10px 14px', borderRadius: 4, border: `1px solid ${C.border}`,
              fontSize: 11, cursor: 'pointer', background: 'transparent', color: C.textDim, minHeight: 44,
            }}>
              Clear
            </button>
          )}
        </div>
        {signalLog.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: C.textDim, fontSize: 12 }}>
            Signal history will appear after scanning
          </div>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {signalLog.slice(0, 50).map((s, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 8px', borderBottom: `1px solid ${C.border}22`, fontSize: 11,
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: C.textDim, fontFamily: MONO, fontSize: 10 }}>{s.date}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 700 }}>{s.coin}</span>
                  <span style={{ color: C.textMuted }}>{s.rule}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: MONO, color: C.textMuted }}>{fmtPrice(s.price)}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: TYPE_COLORS[s.type], textTransform: 'uppercase' }}>{s.type}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
