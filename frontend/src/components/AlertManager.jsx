import { useState, useEffect } from 'react';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import { cardStyle, inputStyle, buttonPrimary, sectionTitle, labelStyle, badge } from '../styles/shared';

const ALERT_TYPES = [
  { value: 'price_below', label: 'Price drops below' },
  { value: 'price_above', label: 'Price rises above' },
  { value: 'drift_above', label: 'Drift exceeds' },
];

function alertDescription(alert) {
  if (alert.alert_type === 'price_below') return `${alert.ticker} below $${alert.threshold}`;
  if (alert.alert_type === 'price_above') return `${alert.ticker} above $${alert.threshold}`;
  return `Any drift > ${alert.threshold}%`;
}

/** @returns {JSX.Element} Alert management UI for creating and viewing price/drift alerts. */
export default function AlertManager({ embedded = false }) {
  const [alerts, setAlerts] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ticker, setTicker] = useState('');
  const [alertType, setAlertType] = useState('price_below');
  const [threshold, setThreshold] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getAlerts(), api.getHoldings()])
      .then(([alertData, holdingsData]) => {
        setAlerts(alertData);
        const h = holdingsData.holdings || [];
        setHoldings(h);
        if (h.length > 0) setTicker(h[0].ticker);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api.createAlert({
        ticker: alertType === 'drift_above' ? '*' : ticker,
        alert_type: alertType,
        threshold: parseFloat(threshold),
      });
      setThreshold('');
      const updated = await api.getAlerts();
      setAlerts(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    await api.deleteAlert(id);
    setAlerts(alerts.filter(a => a.id !== id));
  };

  const isDrift = alertType === 'drift_above';
  const uniqueTickers = [...new Set(holdings.map(h => h.ticker))];

  if (loading) return null;

  return (
    <div style={embedded ? {} : { ...cardStyle, padding: 24, marginTop: 16 }}>
      {!embedded && <h3 style={{ ...sectionTitle, margin: '0 0 16px' }}>Price Alerts</h3>}

      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <div>
          <label htmlFor="alert-type" style={{ ...labelStyle, display: 'block', fontSize: 12, marginBottom: 4 }}>Condition</label>
          <select
            id="alert-type"
            value={alertType}
            onChange={e => setAlertType(e.target.value)}
            style={{ ...inputStyle, fontSize: 14 }}
          >
            {ALERT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {!isDrift && (
          <div>
            <label htmlFor="alert-ticker" style={{ ...labelStyle, display: 'block', fontSize: 12, marginBottom: 4 }}>Ticker</label>
            <select
              id="alert-ticker"
              value={ticker}
              onChange={e => setTicker(e.target.value)}
              style={{ ...inputStyle, fontSize: 14 }}
            >
              {uniqueTickers.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="alert-threshold" style={{ ...labelStyle, display: 'block', fontSize: 12, marginBottom: 4 }}>
            {isDrift ? 'Drift Threshold (%)' : 'Price ($)'}
          </label>
          <input
            id="alert-threshold"
            type="number"
            step="any"
            min="0"
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            placeholder={isDrift ? '5' : '150.00'}
            required
            style={{ ...inputStyle, fontSize: 14 }}
          />
        </div>

        {error && <div role="alert" style={{ color: C.red, fontSize: 12 }}>{error}</div>}

        <button
          type="submit"
          disabled={creating || (!isDrift && !ticker)}
          aria-busy={creating}
          style={{ ...buttonPrimary, padding: '10px 20px', opacity: creating ? 0.6 : 1 }}
        >
          {creating ? 'Creating...' : 'Create Alert'}
        </button>
      </form>

      {alerts.length > 0 && (
        <>
          <div style={{ ...labelStyle, fontSize: 10, marginBottom: 8 }}>
            Active Alerts ({alerts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alerts.map(a => (
              <div key={a.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', background: C.elevated, borderRadius: 8,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontFamily: MONO, fontWeight: 600, color: C.text }}>
                    {alertDescription(a)}
                  </span>
                  <span style={badge(a.triggered ? C.amber : C.green)}>
                    {a.triggered ? 'Triggered' : 'Active'}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(a.id)}
                  aria-label={`Delete alert: ${alertDescription(a)}`}
                  style={{
                    background: 'none', border: 'none', color: C.red,
                    cursor: 'pointer', padding: '6px 10px', minHeight: 36,
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
