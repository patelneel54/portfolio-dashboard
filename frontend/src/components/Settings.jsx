import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';

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
        <button onClick={() => navigate('/')} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textMuted, padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
          Back to Dashboard
        </button>
      </div>

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Projection Parameters</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {fields.map(f => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 12, color: C.textMuted, fontWeight: 600, marginBottom: 4 }}>{f.label}</label>
              <input
                type={f.type}
                step={f.step}
                value={settings[f.key] || ''}
                onChange={e => update(f.key, e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: MONO,
                  background: '#0d1424', border: `1px solid ${C.border}`, borderRadius: 8,
                  color: C.text, outline: 'none', boxSizing: 'border-box',
                }}
              />
              {f.hint && <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{f.hint}</div>}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', background: C.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: C.textMuted }}>Account</h3>
        <button onClick={handleLogout} style={{ padding: '10px 24px', background: C.red + '22', color: C.red, border: `1px solid ${C.red}44`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Log Out
        </button>
      </div>
    </div>
  );
}
