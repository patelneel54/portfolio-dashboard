import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi';
import { C, MONO } from '../styles/theme';
import { cardStyle, inputStyle, buttonPrimary, buttonSecondary } from '../styles/shared';
import { isWebAuthnSupported, startRegistration, startAuthentication } from '../utils/webauthn';

/** @returns {JSX.Element} Login page with PIN and biometric authentication. */
export default function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isWebAuthnSupported() && localStorage.getItem('webauthn_credential_id')) {
      setBiometricAvailable(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await api.login(pin);
      localStorage.setItem('auth_token', token);

      // Offer biometric enrollment if supported and not yet registered
      if (isWebAuthnSupported() && !localStorage.getItem('webauthn_credential_id')) {
        setShowBiometricPrompt(true);
        setLoading(false);
        return;
      }

      navigate('/');
    } catch (err) {
      setError(err.message || 'Invalid PIN');
    } finally {
      setLoading(false);
    }
  };

  const handleEnableBiometric = async () => {
    setLoading(true);
    try {
      const options = await api.webauthnRegisterOptions();
      const credential = await startRegistration(options);
      const result = await api.webauthnRegisterVerify(credential);
      localStorage.setItem('webauthn_credential_id', result.credential_id);
    } catch (err) {
      console.error('Biometric registration failed:', err);
    }
    navigate('/');
  };

  const handleSkipBiometric = () => {
    navigate('/');
  };

  const handleBiometricAuth = async () => {
    setBiometricLoading(true);
    setError('');
    try {
      const options = await api.webauthnAuthOptions();
      const credential = await startAuthentication(options);
      const { token } = await api.webauthnAuthVerify(credential);
      localStorage.setItem('auth_token', token);
      navigate('/');
    } catch (err) {
      console.error('Biometric auth failed:', err);
      setError('Biometric unlock failed. Use PIN instead.');
      setBiometricAvailable(false);
    } finally {
      setBiometricLoading(false);
    }
  };

  // Biometric enrollment prompt (after successful PIN login)
  if (showBiometricPrompt) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
        <div style={{ ...cardStyle, borderRadius: 16, padding: 40, width: '100%', maxWidth: 360, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>&#128274;</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: C.text }}>
            Enable Biometric Unlock?
          </h2>
          <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 28px', lineHeight: 1.5 }}>
            Use Face ID or Touch ID to unlock quickly on future visits.
          </p>
          <button
            onClick={handleEnableBiometric}
            disabled={loading}
            style={{
              ...buttonPrimary, width: '100%', padding: '12px 16px', fontWeight: 700,
              borderRadius: 10, minHeight: 44, opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Setting up...' : 'Yes, Enable'}
          </button>
          <button
            onClick={handleSkipBiometric}
            disabled={loading}
            style={{
              ...buttonSecondary, width: '100%', padding: '12px 16px', marginTop: 10,
              fontWeight: 600, borderRadius: 10, minHeight: 44,
            }}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20 }}>
      <div style={{ ...cardStyle, borderRadius: 16, padding: 40, width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>&#128200;</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', background: `linear-gradient(135deg, ${C.text}, ${C.accent})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Portfolio Command Center
        </h1>
        <p style={{ color: C.textMuted, fontSize: 13, margin: '0 0 32px' }}>Enter your PIN to unlock</p>

        {biometricAvailable && (
          <>
            <button
              onClick={handleBiometricAuth}
              disabled={biometricLoading}
              style={{
                ...buttonPrimary, width: '100%', padding: '12px 16px', fontWeight: 700,
                borderRadius: 10, minHeight: 44, marginBottom: 0,
                background: C.accent, opacity: biometricLoading ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 10v4M7.5 7.5C9 6 10.5 5.5 12 5.5s3 .5 4.5 2M4.5 4.5C7 2.5 9.5 1.5 12 1.5s5 1 7.5 3M1 12c0-3 1.5-6 4-8.5M23 12c0-3-1.5-6-4-8.5M12 18a2 2 0 100-4 2 2 0 000 4zM12 22v-2" />
              </svg>
              {biometricLoading ? 'Unlocking...' : 'Unlock with Biometrics'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <span style={{ color: C.textDim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>or enter PIN</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
          </>
        )}

        {error && <div role="alert" style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter PIN"
            aria-label="Enter PIN"
            autoFocus={!biometricAvailable}
            style={{
              ...inputStyle, padding: '14px 16px', fontSize: 24,
              border: `1px solid ${error ? C.red : C.border}`,
              borderRadius: 10, textAlign: 'center', letterSpacing: 8,
            }}
          />
          <button
            type="submit"
            disabled={!pin || loading}
            aria-busy={loading}
            style={{
              ...buttonPrimary, width: '100%', padding: '12px 16px', marginTop: 16, fontWeight: 700,
              background: pin ? C.accent : C.border, color: pin ? '#fff' : C.textDim,
              borderRadius: 10, cursor: pin ? 'pointer' : 'default',
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
