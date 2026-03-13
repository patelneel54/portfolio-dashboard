import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import { cardStyle, inputStyle, buttonPrimary, buttonSecondary, sectionTitle, labelStyle } from '../styles/shared';

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getSettings().then(data => {
      setSettings(data);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const update = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  const fields = [
    { key: 'monthly_contribution', label: 'Monthly Brokerage Contribution ($)', type: 'number', step: '50' },
    { key: 'monthly_401k_contribution', label: 'Monthly 401k Contribution ($)', type: 'number', step: '50', hint: 'Total employee + employer monthly 401k contribution. Set to 0 to disable.' },
    { key: 'age', label: 'Current Age', type: 'number', step: '1' },
    { key: 'conservative_rate', label: 'Conservative Return Rate', type: 'number', step: '0.01', hint: 'e.g. 0.06 for 6%' },
    { key: 'moderate_rate', label: 'Moderate Return Rate', type: 'number', step: '0.005', hint: 'e.g. 0.085 for 8.5%' },
    { key: 'aggressive_rate', label: 'Aggressive Return Rate', type: 'number', step: '0.01', hint: 'e.g. 0.11 for 11%' },
    { key: 'projection_years', label: 'Projection Years', type: 'number', step: '1' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: C.textMuted }}>
        Loading settings...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 600, margin: '0 auto', paddingTop: 'max(24px, env(safe-area-inset-top))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Settings</h1>
        <button onClick={() => navigate('/')} style={buttonSecondary}>
          Back to Dashboard
        </button>
      </div>

      <div style={{ ...cardStyle, padding: 24 }}>
        <h3 style={{ ...sectionTitle, margin: '0 0 16px' }}>Projection Parameters</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {fields.map(f => (
            <div key={f.key}>
              <label htmlFor={`setting-${f.key}`} style={{ ...labelStyle, display: 'block', fontSize: 12, marginBottom: 4 }}>{f.label}</label>
              <input
                id={`setting-${f.key}`}
                type={f.type}
                step={f.step}
                value={settings[f.key] || ''}
                onChange={e => update(f.key, e.target.value)}
                aria-describedby={f.hint ? `hint-${f.key}` : undefined}
                style={{ ...inputStyle, fontSize: 14 }}
              />
              {f.hint && <div id={`hint-${f.key}`} style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{f.hint}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button onClick={handleSave} disabled={saving} style={{ ...buttonPrimary, padding: '10px 24px', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 24, marginTop: 16 }}>
        <h3 style={{ ...sectionTitle, margin: '0 0 12px' }}>Account</h3>
        <button onClick={handleLogout} style={{ padding: '10px 24px', minHeight: 44, background: C.red + '22', color: C.red, border: `1px solid ${C.red}44`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Log Out
        </button>
      </div>
    </div>
  );
}
