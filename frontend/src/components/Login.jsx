import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';

export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await api.login(pin);
      localStorage.setItem('auth_token', token);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Invalid PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 40, width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>&#128200;</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', background: `linear-gradient(135deg, ${C.text}, ${C.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Portfolio Dashboard
        </h1>
        <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 32px' }}>Enter your PIN to unlock</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter PIN"
            autoFocus
            style={{
              width: '100%', padding: '14px 16px', fontSize: 24, fontFamily: MONO,
              background: '#0d1424', border: `1px solid ${error ? C.red : C.border}`,
              borderRadius: 10, color: C.text, textAlign: 'center', letterSpacing: 8,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {error && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{error}</div>}
          <button
            type="submit"
            disabled={!pin || loading}
            style={{
              width: '100%', padding: '12px 16px', marginTop: 16, fontSize: 14, fontWeight: 700,
              background: pin ? C.accent : C.border, color: pin ? '#fff' : C.textDim,
              border: 'none', borderRadius: 10, cursor: pin ? 'pointer' : 'default',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
