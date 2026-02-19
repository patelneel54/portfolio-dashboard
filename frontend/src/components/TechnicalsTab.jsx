import { useState, useEffect } from 'react';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import GuidePanel from './GuidePanel';

const TechnicalCard = ({ data }) => {
  if (!data) return null;
  const { ticker, price, rsi, sma20, sma50, sma200, support, resistance, trend, note } = data;

  const trendColor = trend.includes('Bull') ? C.green : trend.includes('Bear') ? C.red : C.amber;
  const rsiColor = rsi > 70 ? C.red : rsi < 30 ? C.green : C.amber;

  const minPrice = Math.min(...(support || [price * 0.9]), price * 0.9);
  const maxPrice = Math.max(...(resistance || [price * 1.1]), price * 1.1);
  const priceRange = maxPrice - minPrice || 1;
  const pricePos = ((price - minPrice) / priceRange) * 100;

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: MONO }}>{ticker}</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: C.text, marginLeft: 12, fontFamily: MONO }}>${price.toFixed(2)}</span>
        </div>
        <span style={{ background: trendColor + '22', color: trendColor, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{trend}</span>
      </div>

      {/* Price Range */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Support & Resistance Map</div>
        <div style={{ position: 'relative', height: 48, background: '#0d1424', borderRadius: 8, overflow: 'hidden' }}>
          {(support || []).map((s, i) => {
            const pos = ((s - minPrice) / priceRange) * 100;
            return (
              <div key={`s${i}`} style={{ position: 'absolute', left: `${pos}%`, top: 0, bottom: 0, width: 2, background: i === 0 ? C.green : C.green + '66', zIndex: 2 }}>
                <div style={{ position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: C.green, whiteSpace: 'nowrap', fontFamily: MONO }}>${s}</div>
              </div>
            );
          })}
          {(resistance || []).map((r, i) => {
            const pos = ((r - minPrice) / priceRange) * 100;
            return (
              <div key={`r${i}`} style={{ position: 'absolute', left: `${Math.min(pos, 99)}%`, top: 0, bottom: 0, width: 2, background: i === 0 ? C.red : C.red + '66', zIndex: 2 }}>
                <div style={{ position: 'absolute', bottom: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: C.red, whiteSpace: 'nowrap', fontFamily: MONO }}>${r}</div>
              </div>
            );
          })}
          {/* Current price */}
          <div style={{ position: 'absolute', left: `${Math.min(Math.max(pricePos, 2), 98)}%`, top: 4, bottom: 4, width: 3, background: C.amber, borderRadius: 2, zIndex: 5, boxShadow: `0 0 8px ${C.amber}66` }}>
            <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', fontSize: 9, color: C.amber, whiteSpace: 'nowrap', fontWeight: 700, fontFamily: MONO }}>${price.toFixed(0)}</div>
          </div>
          {/* SMA lines */}
          {[{ val: sma50, label: '50d', col: C.cyan }, { val: sma200, label: '200d', col: C.pink }].map(sma => {
            if (!sma.val) return null;
            const pos = ((sma.val - minPrice) / priceRange) * 100;
            if (pos < 0 || pos > 100) return null;
            return (
              <div key={sma.label} style={{ position: 'absolute', left: `${pos}%`, top: 0, bottom: 0, width: 1, borderLeft: `1px dashed ${sma.col}88`, zIndex: 3 }}>
                <div style={{ position: 'absolute', top: 2, left: 4, fontSize: 8, color: sma.col, whiteSpace: 'nowrap', fontWeight: 600 }}>{sma.label}</div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 20, display: 'flex', gap: 16, fontSize: 10, color: C.textMuted }}>
          <span style={{ color: C.green }}>Support</span>
          <span style={{ color: C.red }}>Resistance</span>
          <span style={{ color: C.amber }}>Current</span>
          <span style={{ color: C.cyan }}>50d SMA</span>
          <span style={{ color: C.pink }}>200d SMA</span>
        </div>
      </div>

      {/* RSI + Metrics */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>RSI (14)</div>
          <div style={{ height: 8, background: '#0d1424', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${rsi}%`, background: `linear-gradient(90deg, ${C.green}, ${C.amber}, ${C.red})`, borderRadius: 4, opacity: 0.8 }} />
            <div style={{ position: 'absolute', left: '30%', top: 0, bottom: 0, width: 1, background: C.textDim + '44' }} />
            <div style={{ position: 'absolute', left: '70%', top: 0, bottom: 0, width: 1, background: C.textDim + '44' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.textDim, marginTop: 3 }}>
            <span>Oversold</span>
            <span style={{ color: rsiColor, fontWeight: 700, fontSize: 12 }}>{rsi.toFixed(0)}</span>
            <span>Overbought</span>
          </div>
        </div>
        <div style={{ flex: 1.5 }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 600 }}>Key Levels</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
            {sma50 && <div><span style={{ color: C.textDim }}>50d:</span> <span style={{ color: price > sma50 ? C.green : C.red, fontFamily: MONO }}>${sma50.toFixed(0)}</span></div>}
            {sma200 && <div><span style={{ color: C.textDim }}>200d:</span> <span style={{ color: price > sma200 ? C.green : C.red, fontFamily: MONO }}>${sma200.toFixed(0)}</span></div>}
            {support?.[0] && <div><span style={{ color: C.textDim }}>S1:</span> <span style={{ color: C.green, fontFamily: MONO }}>${support[0]}</span></div>}
          </div>
        </div>
      </div>

      {note && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#0d1424', borderRadius: 6, fontSize: 11, color: C.textMuted, lineHeight: 1.5, borderLeft: `3px solid ${trendColor}` }}>
          {note}
        </div>
      )}
    </div>
  );
};

export default function TechnicalsTab({ holdings, showGuides }) {
  const [selectedStock, setSelectedStock] = useState(null);
  const [techData, setTechData] = useState({});
  const [loading, setLoading] = useState({});

  const tickers = holdings.filter(h => h.type === 'Stock').map(h => h.ticker);

  useEffect(() => {
    if (tickers.length > 0 && !selectedStock) {
      setSelectedStock(tickers[0]);
    }
  }, [tickers]);

  useEffect(() => {
    // Load technicals for all tickers
    tickers.forEach(async (ticker) => {
      if (techData[ticker] || loading[ticker]) return;
      setLoading(prev => ({ ...prev, [ticker]: true }));
      try {
        const data = await api.getTechnicals(ticker);
        setTechData(prev => ({ ...prev, [ticker]: data }));
      } catch {
        // Technicals may not be available yet
      } finally {
        setLoading(prev => ({ ...prev, [ticker]: false }));
      }
    });
  }, [tickers.join(',')]);

  return (
    <div>
      {showGuides && <GuidePanel guideKey="technicals" />}

      {/* Stock Selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tickers.map(t => (
          <button
            key={t}
            onClick={() => setSelectedStock(t)}
            style={{
              padding: '6px 14px', borderRadius: 8, border: `1px solid ${selectedStock === t ? C.accent : C.border}`,
              background: selectedStock === t ? C.accent + '22' : C.card,
              color: selectedStock === t ? C.accent : C.textMuted,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Selected Stock Detail */}
      {selectedStock && techData[selectedStock] ? (
        <TechnicalCard data={techData[selectedStock]} />
      ) : selectedStock && loading[selectedStock] ? (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center', color: C.textMuted }}>
          Loading technicals for {selectedStock}...
        </div>
      ) : selectedStock ? (
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center', color: C.textMuted }}>
          No technical data for {selectedStock} yet. Price history is still being fetched.
        </div>
      ) : null}

      {/* Quick Scan Grid */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Quick Scan - All Stocks</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {tickers.map(t => {
            const tech = techData[t];
            if (!tech) return (
              <div key={t} style={{ padding: '10px 14px', background: '#0d1424', borderRadius: 8, border: `1px solid ${C.border}` }}>
                <span style={{ fontWeight: 700, fontSize: 13, fontFamily: MONO }}>{t}</span>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{loading[t] ? 'Loading...' : 'No data'}</div>
              </div>
            );
            const trendCol = tech.trend.includes('Bull') ? C.green : tech.trend.includes('Bear') ? C.red : C.amber;
            const rsiCol = tech.rsi > 70 ? C.red : tech.rsi < 30 ? C.green : C.textMuted;
            return (
              <div key={t} onClick={() => setSelectedStock(t)} style={{ padding: '10px 14px', background: '#0d1424', borderRadius: 8, cursor: 'pointer', border: `1px solid ${selectedStock === t ? C.accent + '66' : C.border}`, transition: 'border 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13, fontFamily: MONO }}>{t}</span>
                  <span style={{ fontSize: 9, color: trendCol, fontWeight: 700, background: trendCol + '15', padding: '2px 6px', borderRadius: 4 }}>{tech.trend}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: MONO, marginTop: 4 }}>${tech.price.toFixed(0)}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 9 }}>
                  <span style={{ color: rsiCol }}>RSI {tech.rsi.toFixed(0)}</span>
                  {tech.sma50 && <span style={{ color: tech.price > tech.sma50 ? C.green : C.red }}>{tech.price > tech.sma50 ? '\u25B2' : '\u25BC'}50d</span>}
                  {tech.sma200 && <span style={{ color: tech.price > tech.sma200 ? C.green : C.red }}>{tech.price > tech.sma200 ? '\u25B2' : '\u25BC'}200d</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
