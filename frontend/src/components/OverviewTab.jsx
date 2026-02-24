import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { C, MONO } from '../styles/theme';
import { api } from '../hooks/useApi';
import PortfolioPerformanceChart from './PortfolioPerformanceChart';
import SectorAllocation from './SectorAllocation';
import DividendIntelligence from './DividendIntelligence';

export default function OverviewTab({ holdings, totalValue }) {
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  const fetchIntelligence = useCallback(async () => {
    try {
      const data = await api.getPortfolioIntelligence();
      setIntelligence(data);
    } catch (err) {
      console.error('Failed to fetch portfolio intelligence:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchIntelligence();
    }
  }, [fetchIntelligence]);

  const driftData = useMemo(() =>
    [...holdings].sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 8), [holdings]);

  return (
    <div>
      {/* Portfolio Performance Chart */}
      <div style={{ marginBottom: 16 }}>
        <PortfolioPerformanceChart />
      </div>

      {/* Sector Allocation + Dividend Intelligence */}
      {loading ? (
        <div style={{
          background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
          padding: 40, marginBottom: 16, textAlign: 'center',
        }}>
          <div style={{ color: C.textDim, fontSize: 12 }}>Loading sector & dividend data...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 16 }}>
          <SectorAllocation
            sectors={intelligence?.sectors}
            sectorHhi={intelligence?.sector_hhi || 0}
            sectorHhiLabel={intelligence?.sector_hhi_label || ''}
            totalValue={intelligence?.total_value || totalValue}
          />
          <DividendIntelligence dividends={intelligence?.dividends} />
        </div>
      )}

      {/* Drift Table */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Portfolio Drift - Biggest Misallocations</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {driftData.map(h => {
            const isOver = h.drift > 0;
            return (
              <div key={h.ticker} style={{ padding: '10px 14px', background: '#0d1424', borderRadius: 8, border: `1px solid ${isOver ? C.red + '33' : C.green + '33'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, fontFamily: MONO }}>{h.ticker}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isOver ? C.red : C.green, fontFamily: MONO }}>
                    {isOver ? '+' : ''}{h.drift.toFixed(1)}%
                  </span>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>
                  {h.actual_allocation.toFixed(1)}% actual &rarr; {h.target_allocation.toFixed(1)}% target
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
