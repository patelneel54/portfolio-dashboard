import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';

const TIMEFRAMES = [
  { key: '1D', label: '1D', days: 1 },
  { key: '1W', label: '1W', days: 7 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: 'YTD', label: 'YTD', days: null },
  { key: '1Y', label: '1Y', days: 365 },
  { key: 'ALL', label: 'ALL', days: null },
];

function getTimeframeStartDate(key) {
  const now = new Date();
  if (key === 'YTD') {
    return `${now.getFullYear()}-01-01`;
  }
  if (key === 'ALL') return null;
  if (key === '1D') {
    // Today only — return today's date string
    return now.toISOString().slice(0, 10);
  }
  const tf = TIMEFRAMES.find(t => t.key === key);
  if (!tf?.days) return null;
  const start = new Date(now);
  start.setDate(start.getDate() - tf.days);
  return start.toISOString().slice(0, 10);
}

function formatDate(dateStr, timeframe) {
  const d = new Date(dateStr + 'T00:00:00');
  if (timeframe === '1D') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (timeframe === '1W') return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (timeframe === '1M' || timeframe === '3M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function normalizeToBase100(values) {
  if (!values.length) return [];
  const base = values[0];
  if (!base || base === 0) return values.map(() => 100);
  return values.map(v => v != null ? (v / base) * 100 : null);
}

const ChartTooltip = ({ active, payload, label, showBenchmark, timeframe, startValue }) => {
  if (!active || !payload?.length) return null;
  const portfolioEntry = payload.find(p => p.dataKey === 'portfolio' || p.dataKey === 'portfolioNorm');
  const benchEntry = payload.find(p => p.dataKey === 'benchmarkNorm');
  const pVal = portfolioEntry?.payload?.portfolioRaw;
  const pctChange = startValue && pVal ? ((pVal - startValue) / startValue * 100) : null;

  return (
    <div style={{
      background: '#0f1729', border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '10px 14px', fontSize: 11, fontFamily: MONO, minWidth: 160,
    }}>
      <div style={{ color: C.textDim, marginBottom: 6 }}>
        {formatDate(label, timeframe)}
      </div>
      {pVal != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
          <span style={{ color: C.textMuted }}>Portfolio</span>
          <span style={{ color: C.text, fontWeight: 600 }}>
            ${pVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      )}
      {pctChange != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
          <span style={{ color: C.textMuted }}>Change</span>
          <span style={{ color: pctChange >= 0 ? C.green : C.red, fontWeight: 600 }}>
            {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%
          </span>
        </div>
      )}
      {showBenchmark && benchEntry?.value != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ color: C.textMuted }}>S&P 500</span>
          <span style={{ color: C.amber, fontWeight: 600 }}>
            {(benchEntry.value - 100).toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  );
};

export default function PortfolioPerformanceChart({ compact = false }) {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('3M');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const fetchedRef = useRef(false);

  const fetchPerformance = useCallback(async () => {
    try {
      const data = await api.getPerformance();
      setRawData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchPerformance();
    }
  }, [fetchPerformance]);

  // Filter data by timeframe
  const { chartData, periodReturn, periodStartDate, startValue } = useMemo(() => {
    if (!rawData?.dates?.length) return { chartData: [], periodReturn: 0, periodStartDate: '', startValue: 0 };

    const startDate = getTimeframeStartDate(timeframe);
    let startIdx = 0;
    if (startDate) {
      startIdx = rawData.dates.findIndex(d => d >= startDate);
      if (startIdx < 0) startIdx = 0;
    }

    const dates = rawData.dates.slice(startIdx);
    const portfolioValues = rawData.portfolio_values.slice(startIdx);
    const benchmarkValues = rawData.benchmark_values.slice(startIdx);

    const sVal = portfolioValues[0] || 0;
    const endVal = portfolioValues[portfolioValues.length - 1] || 0;
    const ret = sVal ? ((endVal - sVal) / sVal) * 100 : 0;

    if (showBenchmark) {
      // Normalized mode
      const pNorm = normalizeToBase100(portfolioValues);
      const bNorm = normalizeToBase100(benchmarkValues.map(v => v ?? null));

      const data = dates.map((d, i) => ({
        date: d,
        portfolioNorm: pNorm[i] != null ? +pNorm[i].toFixed(2) : null,
        benchmarkNorm: bNorm[i] != null ? +bNorm[i].toFixed(2) : null,
        portfolioRaw: portfolioValues[i],
      }));

      return { chartData: data, periodReturn: ret, periodStartDate: dates[0], startValue: sVal };
    }

    const data = dates.map((d, i) => ({
      date: d,
      portfolio: portfolioValues[i],
      portfolioRaw: portfolioValues[i],
    }));

    return { chartData: data, periodReturn: ret, periodStartDate: dates[0], startValue: sVal };
  }, [rawData, timeframe, showBenchmark]);

  const gainColor = periodReturn >= 0 ? C.green : C.red;
  const chartHeight = compact ? 220 : 360;

  if (loading) {
    return (
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <div style={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 12 }}>
          Loading performance data...
        </div>
      </div>
    );
  }

  if (error || !chartData.length) {
    return (
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
        <div style={{ height: compact ? 120 : 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textDim, fontSize: 12 }}>
          {error || 'No performance history yet. Data builds as prices are tracked.'}
        </div>
      </div>
    );
  }

  // Compute tick indices for X axis (show ~5-6 labels)
  const tickCount = compact ? 4 : 6;
  const step = Math.max(1, Math.floor(chartData.length / tickCount));
  const xTicks = chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1).map(d => d.date);

  return (
    <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.textMuted }}>
            Portfolio Performance
          </h3>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, fontFamily: MONO, color: gainColor }}>
              {periodReturn >= 0 ? '+' : ''}{periodReturn.toFixed(2)}%
            </span>
            {periodStartDate && (
              <span style={{ fontSize: 11, color: C.textDim }}>
                Since {formatDate(periodStartDate, timeframe)}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          {/* Timeframe selector */}
          <div style={{ display: 'flex', gap: 2, background: C.bg, borderRadius: 6, padding: 2 }}>
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.key}
                onClick={() => setTimeframe(tf.key)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: 'none',
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: MONO,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: timeframe === tf.key ? gainColor : 'transparent',
                  color: timeframe === tf.key ? '#fff' : C.textDim,
                  borderBottom: timeframe === tf.key ? `2px solid ${gainColor}` : '2px solid transparent',
                }}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Benchmark toggle */}
          {!compact && (
            <button
              onClick={() => setShowBenchmark(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px',
                borderRadius: 4,
                border: `1px solid ${showBenchmark ? C.amber + '66' : C.border}`,
                background: showBenchmark ? C.amber + '11' : 'transparent',
                color: showBenchmark ? C.amber : C.textDim,
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: showBenchmark ? C.amber : C.textDim,
                transition: 'background 0.2s',
              }} />
              vs S&P 500
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={chartHeight}>
        {showBenchmark ? (
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={gainColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={gainColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis
              dataKey="date" tick={{ fill: C.textDim, fontSize: 9 }}
              axisLine={{ stroke: C.border }} tickLine={false}
              ticks={xTicks}
              tickFormatter={d => formatDate(d, timeframe)}
            />
            <YAxis
              tick={{ fill: C.textDim, fontSize: 9, fontFamily: MONO }}
              axisLine={false} tickLine={false}
              domain={['auto', 'auto']}
              tickFormatter={v => `${v.toFixed(0)}`}
              width={36}
            />
            <Tooltip content={<ChartTooltip showBenchmark={showBenchmark} timeframe={timeframe} startValue={startValue} />} />
            <Line
              type="monotone" dataKey="portfolioNorm" name="Portfolio"
              stroke={gainColor} strokeWidth={2} dot={false}
              animationDuration={600} animationEasing="ease-out"
            />
            <Line
              type="monotone" dataKey="benchmarkNorm" name="S&P 500"
              stroke={C.amber} strokeWidth={1.5} dot={false}
              strokeDasharray="4 3" connectNulls
              animationDuration={600} animationEasing="ease-out"
            />
          </LineChart>
        ) : (
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={gainColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={gainColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis
              dataKey="date" tick={{ fill: C.textDim, fontSize: 9 }}
              axisLine={{ stroke: C.border }} tickLine={false}
              ticks={xTicks}
              tickFormatter={d => formatDate(d, timeframe)}
            />
            <YAxis
              tick={{ fill: C.textDim, fontSize: 9, fontFamily: MONO }}
              axisLine={false} tickLine={false}
              domain={['dataMin - 200', 'dataMax + 200']}
              tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
              width={48}
            />
            <Tooltip content={<ChartTooltip showBenchmark={false} timeframe={timeframe} startValue={startValue} />} />
            <Area
              type="monotone" dataKey="portfolio" name="Portfolio"
              stroke={gainColor} strokeWidth={2}
              fill="url(#portfolioAreaGrad)"
              dot={false}
              animationDuration={600} animationEasing="ease-out"
            />
          </AreaChart>
        )}
      </ResponsiveContainer>

      {/* Legend when benchmark is on */}
      {showBenchmark && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 10, fontSize: 10, color: C.textDim }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 16, height: 2, background: gainColor, borderRadius: 1 }} />
            Portfolio (normalized)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 16, height: 2, background: C.amber, borderRadius: 1, borderStyle: 'dashed' }} />
            S&P 500 (normalized)
          </span>
          <span style={{ color: C.textDim, fontStyle: 'italic' }}>
            Both start at 100%
          </span>
        </div>
      )}
    </div>
  );
}
