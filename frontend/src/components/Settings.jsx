import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../hooks/useApi';
import { C, MONO, SANS } from '../styles/theme';
import { cardStyle, inputStyle, buttonPrimary, buttonSecondary, sectionTitle, labelStyle, dangerButton, inputGroupWrapper, inputAddon } from '../styles/shared';
import { isWebAuthnSupported, startRegistration } from '../utils/webauthn';
import AlertManager from './AlertManager';
import { isPushSupported, getPermissionState, subscribeToPush, unsubscribeFromPush, isSubscribed, sendTestNotification } from '../utils/pushNotifications';

// ── Inline Sub-components ──

function ToggleSwitch({ enabled, onChange, disabled, loading }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled || loading}
      aria-label={enabled ? 'Disable' : 'Enable'}
      aria-checked={enabled}
      role="switch"
      style={{
        width: 48, height: 28, borderRadius: 14, border: 'none',
        background: enabled ? C.green : C.border,
        position: 'relative', cursor: 'pointer', padding: 0,
        opacity: loading ? 0.5 : 1,
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: 11,
        background: '#fff',
        position: 'absolute', top: 3,
        left: enabled ? 23 : 3,
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

function InputGroup({ label, value, onChange, prefix, suffix, hint, min, max, step, error, id }) {
  return (
    <div>
      <label htmlFor={id} style={{ ...labelStyle, display: 'block', fontSize: 11, marginBottom: 4 }}>{label}</label>
      <div style={inputGroupWrapper}>
        {prefix && <span style={{ ...inputAddon, left: 12 }}>{prefix}</span>}
        <input
          id={id}
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            ...inputStyle,
            fontSize: 14,
            paddingLeft: prefix ? 28 : 12,
            paddingRight: suffix ? 40 : 12,
          }}
        />
        {suffix && <span style={{ ...inputAddon, right: 12 }}>{suffix}</span>}
      </div>
      {hint && <div style={{ fontSize: 10, color: C.textDim, marginTop: 3 }}>{hint}</div>}
      {error && <div style={{ fontSize: 10, color: C.red, marginTop: 3 }}>{error}</div>}
    </div>
  );
}

function ConfirmButton({ label, confirmLabel, onConfirm, style }) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef(null);

  const handleClick = () => {
    if (confirming) {
      clearTimeout(timer.current);
      setConfirming(false);
      onConfirm();
    } else {
      setConfirming(true);
      timer.current = setTimeout(() => setConfirming(false), 3000);
    }
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <button onClick={handleClick} style={{
      ...style,
      background: confirming ? C.red + '33' : style.background,
      borderColor: confirming ? C.red + '88' : style.borderColor,
    }}>
      {confirming ? (confirmLabel || 'Are you sure?') : label}
    </button>
  );
}

// ── Tab definitions ──

const TABS = [
  { id: 'projections', label: 'Projections' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'data', label: 'Data' },
  { id: 'about', label: 'About' },
  { id: 'account', label: 'Account' },
];

const RATE_FIELDS = new Set(['conservative_rate', 'moderate_rate', 'aggressive_rate']);

// ── Main Component ──

/** @returns {JSX.Element} Settings page with tabbed sections. */
export default function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('projections');

  // Projection settings
  const [settings, setSettings] = useState({});
  const [savedSettings, setSavedSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Security
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);

  // Data management
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Notifications
  const [pushSupported] = useState(isPushSupported());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState('');
  const [pushTestSent, setPushTestSent] = useState(false);

  // About
  const [holdingsCount, setHoldingsCount] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
  const [storageEstimate, setStorageEstimate] = useState(null);

  // Load data on mount
  useEffect(() => {
    Promise.all([
      api.getSettings(),
      api.getHoldings(),
      api.getAlerts(),
    ]).then(([settingsData, holdingsData, alertsData]) => {
      // Convert rate fields from decimal to percentage for display
      const display = { ...settingsData };
      for (const key of RATE_FIELDS) {
        if (display[key]) display[key] = (parseFloat(display[key]) * 100).toFixed(1);
      }
      setSettings(display);
      setSavedSettings(display);
      setHoldingsCount(holdingsData.holdings?.length || 0);
      setLastRefreshed(holdingsData.last_refreshed);
      setAlertsCount(alertsData.length);
      setLoading(false);
    });

    if (isWebAuthnSupported()) {
      setBiometricSupported(true);
      api.webauthnStatus().then(data => setBiometricEnabled(data.registered)).catch(() => {});
    }

    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(est => setStorageEstimate(est)).catch(() => {});
    }

    // Check push subscription state
    if (pushSupported) {
      isSubscribed().then(setPushSubscribed);
    }
  }, []);

  // Unsaved changes detection
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const update = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  // Save settings (convert rates back to decimal)
  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const toSave = { ...settings };
      for (const key of RATE_FIELDS) {
        if (toSave[key]) toSave[key] = (parseFloat(toSave[key]) / 100).toFixed(4);
      }
      await api.updateSettings(toSave);
      setSavedSettings({ ...settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('webauthn_credential_id');
    navigate('/login');
  };

  const handleBiometricToggle = async () => {
    setBiometricLoading(true);
    try {
      if (biometricEnabled) {
        await api.webauthnDeleteCredential();
        localStorage.removeItem('webauthn_credential_id');
        setBiometricEnabled(false);
      } else {
        const options = await api.webauthnRegisterOptions();
        const credential = await startRegistration(options);
        const result = await api.webauthnRegisterVerify(credential);
        localStorage.setItem('webauthn_credential_id', result.credential_id);
        setBiometricEnabled(true);
      }
    } catch (err) {
      console.error('Biometric toggle failed:', err);
    } finally {
      setBiometricLoading(false);
    }
  };

  const handlePinChange = async (e) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess(false);
    if (newPin.length < 4) { setPinError('New PIN must be at least 4 characters'); return; }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return; }
    setPinSaving(true);
    try {
      await api.changePin(currentPin, newPin);
      setPinSuccess(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setTimeout(() => { setPinSuccess(false); setShowPinChange(false); }, 2000);
    } catch (err) {
      setPinError(err.message);
    } finally {
      setPinSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshPrices();
      const data = await api.getHoldings();
      setLastRefreshed(data.last_refreshed);
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = async (format) => {
    setExporting(format);
    try {
      await api.exportData(format);
    } finally {
      setExporting(null);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api.importFidelityCSV(importFile);
      setImportResult(result);
      setImportFile(null);
    } catch (err) {
      setImportResult({ error: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleResetData = async () => {
    await api.resetAllData();
    navigate('/');
  };

  // Parse JWT for session info
  const getSessionInfo = () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        issued: new Date(payload.iat * 1000),
        expires: new Date(payload.exp * 1000),
      };
    } catch { return null; }
  };

  const formatTime = (date) => {
    if (!date) return '—';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' +
      date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: C.textMuted }}>
        Loading settings...
      </div>
    );
  }

  const sessionInfo = getSessionInfo();

  // ── Tab content renderers ──

  const renderProjections = () => (
    <div style={{ ...cardStyle, padding: 24, animation: 'fadeSlideUp 0.3s ease-out' }}>
      <div style={{ ...labelStyle, fontSize: 10, marginBottom: 12, color: C.textDim }}>Contributions</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <InputGroup id="s-monthly" label="Monthly Brokerage" prefix="$" value={settings.monthly_contribution || ''} onChange={v => update('monthly_contribution', v)} step="50" min="0" />
        <InputGroup id="s-401k" label="Monthly 401k" prefix="$" value={settings.monthly_401k_contribution || ''} onChange={v => update('monthly_401k_contribution', v)} step="50" min="0" hint="Employee + employer total" />
      </div>

      <div style={{ ...labelStyle, fontSize: 10, marginTop: 20, marginBottom: 12, color: C.textDim }}>Growth Assumptions</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <InputGroup id="s-conservative" label="Conservative" suffix="%" value={settings.conservative_rate || ''} onChange={v => update('conservative_rate', v)} step="0.5" min="0" max="30" />
        <InputGroup id="s-moderate" label="Moderate" suffix="%" value={settings.moderate_rate || ''} onChange={v => update('moderate_rate', v)} step="0.5" min="0" max="30" />
        <InputGroup id="s-aggressive" label="Aggressive" suffix="%" value={settings.aggressive_rate || ''} onChange={v => update('aggressive_rate', v)} step="0.5" min="0" max="30" />
      </div>

      <div style={{ ...labelStyle, fontSize: 10, marginTop: 20, marginBottom: 12, color: C.textDim }}>Personal</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <InputGroup id="s-age" label="Current Age" suffix="yrs" value={settings.age || ''} onChange={v => update('age', v)} step="1" min="16" max="100" />
        <InputGroup id="s-years" label="Projection Years" suffix="yrs" value={settings.projection_years || ''} onChange={v => update('projection_years', v)} step="1" min="1" max="50" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <button onClick={handleSave} disabled={saving || !hasChanges} style={{
          ...buttonPrimary, padding: '10px 24px',
          opacity: (saving || !hasChanges) ? 0.5 : 1,
          position: 'relative',
        }}>
          {saving ? 'Saving...' : saved ? 'Saved!' : hasChanges ? 'Save Changes' : 'Saved'}
          {hasChanges && !saving && !saved && (
            <span style={{
              position: 'absolute', top: -3, right: -3,
              width: 8, height: 8, borderRadius: 4,
              background: C.amber,
            }} />
          )}
        </button>
      </div>
    </div>
  );

  const renderAlerts = () => (
    <div style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
      <AlertManager embedded />
    </div>
  );

  const handlePushToggle = async () => {
    setPushLoading(true);
    setPushError('');
    setPushTestSent(false);
    try {
      if (pushSubscribed) {
        const result = await unsubscribeFromPush();
        if (result.success) setPushSubscribed(false);
        else setPushError(result.error);
      } else {
        const result = await subscribeToPush();
        if (result.success) setPushSubscribed(true);
        else setPushError(result.error);
      }
    } finally {
      setPushLoading(false);
    }
  };

  const handlePushTest = async () => {
    setPushTestSent(false);
    const result = await sendTestNotification();
    if (result.success) setPushTestSent(true);
    else setPushError(result.error || 'Test failed');
  };

  const renderNotifications = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeSlideUp 0.3s ease-out' }}>
      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Push Notifications</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
              Get alerts when price targets hit or portfolio drifts
            </div>
          </div>
          {pushSupported ? (
            <ToggleSwitch enabled={pushSubscribed} onChange={handlePushToggle} loading={pushLoading} />
          ) : (
            <span style={{ fontSize: 11, color: C.textDim }}>Not supported</span>
          )}
        </div>
        {pushError && <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>{pushError}</div>}
        {!pushSupported && (
          <div style={{ fontSize: 11, color: C.amber, marginTop: 8, lineHeight: 1.5 }}>
            Push notifications require iOS 16.4+ with the app added to your home screen, or a modern desktop browser.
          </div>
        )}
      </div>

      {pushSubscribed && (
        <div style={{ ...cardStyle, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Test Notification</div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 12 }}>
            Send a test push notification to verify everything is working.
          </div>
          <button
            onClick={handlePushTest}
            style={{ ...buttonSecondary, background: C.accent + '22', border: `1px solid ${C.accent}`, color: C.accent }}
          >
            Send Test
          </button>
          {pushTestSent && <div style={{ fontSize: 11, color: C.green, marginTop: 8 }}>Test notification sent! Check your device.</div>}
        </div>
      )}

      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>When Will I Get Notified?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Price Alerts', desc: 'When a stock hits your price target (above or below)', color: C.green },
            { label: 'Drift Alerts', desc: 'When portfolio allocation drifts beyond your threshold', color: C.amber },
            { label: 'Daily Check', desc: 'Alerts are checked after the daily price refresh at market close', color: C.blue },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: item.color, marginTop: 6, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.label}</div>
                <div style={{ fontSize: 11, color: C.textDim }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 10, color: C.textDim, textAlign: 'center', paddingTop: 8 }}>
        Notifications are sent via Web Push. Set up alerts in the Alerts tab to receive notifications.
        {getPermissionState() === 'denied' && (
          <div style={{ color: C.red, marginTop: 4 }}>
            Notification permission was denied. To re-enable, update your browser/OS notification settings for this site.
          </div>
        )}
      </div>
    </div>
  );

  const renderSecurity = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeSlideUp 0.3s ease-out' }}>
      {biometricSupported && (
        <div style={{ ...cardStyle, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Biometric Unlock</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Use Face ID or Touch ID to unlock</div>
            </div>
            <ToggleSwitch enabled={biometricEnabled} onChange={handleBiometricToggle} loading={biometricLoading} />
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Change PIN</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>Update your login PIN</div>
          </div>
          {!showPinChange && (
            <button onClick={() => setShowPinChange(true)} style={{ ...buttonSecondary, padding: '8px 16px', fontSize: 12 }}>
              Change
            </button>
          )}
        </div>

        {showPinChange && (
          <form onSubmit={handlePinChange} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label htmlFor="pin-current" style={{ ...labelStyle, display: 'block', fontSize: 11, marginBottom: 4 }}>Current PIN</label>
              <input id="pin-current" type="password" value={currentPin} onChange={e => setCurrentPin(e.target.value)} style={{ ...inputStyle, fontSize: 14 }} autoComplete="current-password" />
            </div>
            <div>
              <label htmlFor="pin-new" style={{ ...labelStyle, display: 'block', fontSize: 11, marginBottom: 4 }}>New PIN</label>
              <input id="pin-new" type="password" value={newPin} onChange={e => setNewPin(e.target.value)} style={{ ...inputStyle, fontSize: 14 }} autoComplete="new-password" />
            </div>
            <div>
              <label htmlFor="pin-confirm" style={{ ...labelStyle, display: 'block', fontSize: 11, marginBottom: 4 }}>Confirm New PIN</label>
              <input id="pin-confirm" type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} style={{ ...inputStyle, fontSize: 14 }} autoComplete="new-password" />
            </div>
            {pinError && <div role="alert" style={{ color: C.red, fontSize: 12 }}>{pinError}</div>}
            {pinSuccess && <div role="status" style={{ color: C.green, fontSize: 12 }}>PIN changed successfully!</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={pinSaving} style={{ ...buttonPrimary, padding: '8px 20px', opacity: pinSaving ? 0.6 : 1 }}>
                {pinSaving ? 'Saving...' : 'Update PIN'}
              </button>
              <button type="button" onClick={() => { setShowPinChange(false); setPinError(''); setCurrentPin(''); setNewPin(''); setConfirmPin(''); }} style={{ ...buttonSecondary, padding: '8px 20px' }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {sessionInfo && (
        <div style={{ ...cardStyle, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>Session</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: C.textMuted }}>Signed in</span>
              <span style={{ fontFamily: MONO, color: C.text }}>{formatTime(sessionInfo.issued)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: C.textMuted }}>Expires</span>
              <span style={{ fontFamily: MONO, color: C.text }}>{formatTime(sessionInfo.expires)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderData = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeSlideUp 0.3s ease-out' }}>
      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Refresh Prices</div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16 }}>
          Last refreshed: {timeAgo(lastRefreshed)}
        </div>
        <button onClick={handleRefresh} disabled={refreshing} style={{ ...buttonPrimary, padding: '10px 24px', opacity: refreshing ? 0.6 : 1 }}>
          {refreshing ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>

      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Export Portfolio</div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16 }}>Download your holdings data</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => handleExport('csv')} disabled={!!exporting} style={{ ...buttonSecondary, padding: '10px 20px', opacity: exporting ? 0.6 : 1 }}>
            {exporting === 'csv' ? 'Downloading...' : 'Export CSV'}
          </button>
          <button onClick={() => handleExport('json')} disabled={!!exporting} style={{ ...buttonSecondary, padding: '10px 20px', opacity: exporting ? 0.6 : 1 }}>
            {exporting === 'json' ? 'Downloading...' : 'Export JSON'}
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Import from Fidelity</div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16 }}>Upload a Fidelity 401k CSV export</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{
            ...buttonSecondary, padding: '10px 20px', display: 'inline-block', cursor: 'pointer',
          }}>
            {importFile ? importFile.name : 'Choose File'}
            <input type="file" accept=".csv" onChange={e => { setImportFile(e.target.files[0] || null); setImportResult(null); }} style={{ display: 'none' }} />
          </label>
          {importFile && (
            <button onClick={handleImport} disabled={importing} style={{ ...buttonPrimary, padding: '10px 20px', opacity: importing ? 0.6 : 1 }}>
              {importing ? 'Importing...' : 'Import'}
            </button>
          )}
        </div>
        {importResult && (
          <div style={{ marginTop: 12, fontSize: 12, color: importResult.error ? C.red : C.green }}>
            {importResult.error
              ? importResult.error
              : `Added ${importResult.added}, updated ${importResult.updated}${importResult.errors?.length ? `, ${importResult.errors.length} errors` : ''}`}
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Clear Price Cache</div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16 }}>
          Removes cached price history. Prices will be re-fetched on next refresh.
        </div>
        <ConfirmButton
          label="Clear Cache"
          confirmLabel="Confirm Clear?"
          onConfirm={() => api.clearPriceCache()}
          style={{ ...dangerButton, padding: '10px 20px' }}
        />
      </div>
    </div>
  );

  const renderAbout = () => (
    <div style={{ ...cardStyle, padding: 24, animation: 'fadeSlideUp 0.3s ease-out' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Portfolio Command Center</div>
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 20 }}>v1.0.0</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.textMuted }}>Holdings</span>
          <span style={{ fontFamily: MONO, color: C.text }}>{holdingsCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.textMuted }}>Active Alerts</span>
          <span style={{ fontFamily: MONO, color: C.text }}>{alertsCount}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
          <span style={{ color: C.textMuted }}>PWA Status</span>
          <span style={{ fontFamily: MONO, color: navigator.serviceWorker?.controller ? C.green : C.textDim }}>
            {navigator.serviceWorker?.controller ? 'Installed' : 'Not installed'}
          </span>
        </div>
        {storageEstimate && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.textMuted }}>Storage Used</span>
            <span style={{ fontFamily: MONO, color: C.text }}>
              {formatBytes(storageEstimate.usage)} / {formatBytes(storageEstimate.quota)}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '10px 0' }}>
          <span style={{ color: C.textMuted }}>Service Worker</span>
          <span style={{ fontFamily: MONO, color: navigator.serviceWorker?.controller ? C.green : C.textDim }}>
            {navigator.serviceWorker?.controller ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
    </div>
  );

  const renderAccount = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeSlideUp 0.3s ease-out' }}>
      <div style={{ ...cardStyle, padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Sign Out</div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16 }}>
          End your current session
        </div>
        <button onClick={handleLogout} style={{ ...dangerButton, padding: '10px 24px' }}>
          Log Out
        </button>
      </div>

      <div style={{
        ...cardStyle, padding: 24,
        border: `1px solid ${C.red}33`,
        background: C.red + '08',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.red, marginBottom: 4 }}>Danger Zone</div>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16 }}>
          Permanently delete all holdings, price history, and alerts. Settings will be reset to defaults. This cannot be undone.
        </div>
        <ConfirmButton
          label="Reset All Data"
          confirmLabel="Confirm Reset? This is irreversible."
          onConfirm={handleResetData}
          style={{ ...dangerButton, padding: '10px 24px' }}
        />
      </div>
    </div>
  );

  const tabContent = {
    projections: renderProjections,
    alerts: renderAlerts,
    notifications: renderNotifications,
    security: renderSecurity,
    data: renderData,
    about: renderAbout,
    account: renderAccount,
  };

  return (
    <div style={{ padding: '24px 20px', maxWidth: 600, margin: '0 auto', paddingTop: 'max(24px, env(safe-area-inset-top))' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Settings</h1>
        <button onClick={() => {
          if (hasChanges && !window.confirm('You have unsaved changes. Leave anyway?')) return;
          navigate('/');
        }} style={buttonSecondary}>
          Back to Dashboard
        </button>
      </div>

      {/* Tab Bar */}
      <div role="tablist" aria-label="Settings sections" style={{
        display: 'flex',
        gap: 6,
        marginBottom: 20,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        paddingBottom: 2,
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                border: `1px solid ${isActive ? C.accent + '44' : C.border}`,
                background: isActive ? C.accent + '18' : 'transparent',
                color: isActive ? C.accent : C.textMuted,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: SANS,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minHeight: 36,
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div
        key={activeTab}
        role="tabpanel"
        id={`settings-panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {tabContent[activeTab]()}
      </div>
    </div>
  );
}
