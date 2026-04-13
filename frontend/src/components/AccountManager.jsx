import { useState, useEffect, useCallback } from 'react';
import { api } from '../hooks/useApi';
import { C } from '../styles/theme';
import { cardStyle, buttonPrimary, buttonSecondary, inputStyle, labelStyle } from '../styles/shared';

const TYPE_OPTIONS = [
  { value: 'brokerage', label: 'Brokerage (taxable)' },
  { value: 'ira', label: 'Traditional IRA' },
  { value: 'roth_ira', label: 'Roth IRA' },
  { value: '401k', label: '401(k)' },
  { value: 'hsa', label: 'HSA' },
  { value: 'crypto', label: 'Crypto' },
];

function typeLabel(t) {
  return TYPE_OPTIONS.find(o => o.value === t)?.label || t;
}

export default function AccountManager() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('brokerage');
  const [newInstitution, setNewInstitution] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editInstitution, setEditInstitution] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listAccounts();
      setAccounts(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) { setError('Name is required'); return; }
    setSaving(true);
    try {
      await api.createAccount({ name, account_type: newType, institution: newInstitution.trim() || undefined });
      setNewName(''); setNewInstitution(''); setNewType('brokerage'); setShowAdd(false);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (acct) => {
    setEditingId(acct.id);
    setEditName(acct.name);
    setEditInstitution(acct.institution || '');
  };

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) { setError('Name cannot be empty'); return; }
    setSaving(true);
    try {
      await api.updateAccount(editingId, { name, institution: editInstitution.trim() || null });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (acct) => {
    if (acct.holding_count > 0) return;
    if (!window.confirm(`Delete account "${acct.name}"?`)) return;
    try {
      await api.deleteAccount(acct.id);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...cardStyle }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Your Accounts</div>
          {!showAdd && (
            <button onClick={() => setShowAdd(true)} style={{ ...buttonPrimary, padding: '6px 14px', fontSize: 12, minHeight: 36 }}>
              + Add Account
            </button>
          )}
        </div>

        {showAdd && (
          <div style={{ padding: 12, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={labelStyle}>Name</div>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Fidelity Individual"
                  style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <div style={labelStyle}>Type</div>
                <select value={newType} onChange={e => setNewType(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
                  {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>Institution (optional)</div>
                <input type="text" value={newInstitution} onChange={e => setNewInstitution(e.target.value)}
                  placeholder="e.g. Fidelity, Schwab"
                  style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowAdd(false); setError(null); }} style={{ ...buttonSecondary, padding: '6px 14px', fontSize: 12, minHeight: 36 }}>Cancel</button>
                <button onClick={handleCreate} disabled={saving} style={{ ...buttonPrimary, padding: '6px 14px', fontSize: 12, minHeight: 36, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', marginBottom: 10, background: C.red + '22', border: `1px solid ${C.red}`, borderRadius: 6, color: C.red, fontSize: 12 }}>
            {error}
          </div>
        )}

        {loading && accounts.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: C.textDim, fontSize: 12 }}>Loading…</div>
        )}

        {!loading && accounts.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: C.textDim, fontSize: 12 }}>
            No accounts yet. Add one to organize your holdings across brokerages.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accounts.map(acct => (
            <div key={acct.id} style={{ padding: 12, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
              {editingId === acct.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                  <input type="text" value={editInstitution} onChange={e => setEditInstitution(e.target.value)} placeholder="Institution" style={{ ...inputStyle, width: '100%' }} />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditingId(null)} style={{ ...buttonSecondary, padding: '6px 14px', fontSize: 12, minHeight: 36 }}>Cancel</button>
                    <button onClick={saveEdit} disabled={saving} style={{ ...buttonPrimary, padding: '6px 14px', fontSize: 12, minHeight: 36, opacity: saving ? 0.6 : 1 }}>Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{acct.name}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                      {typeLabel(acct.account_type)}{acct.institution ? ` · ${acct.institution}` : ''} · {acct.holding_count} holding{acct.holding_count === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => startEdit(acct)} style={{ ...buttonSecondary, padding: '6px 12px', fontSize: 11, minHeight: 32 }}>Edit</button>
                    <button
                      onClick={() => handleDelete(acct)}
                      disabled={acct.holding_count > 0}
                      title={acct.holding_count > 0 ? `Has ${acct.holding_count} holding${acct.holding_count === 1 ? '' : 's'}` : 'Delete account'}
                      style={{
                        padding: '6px 12px', fontSize: 11, minHeight: 32, cursor: acct.holding_count > 0 ? 'not-allowed' : 'pointer',
                        background: 'transparent', border: `1px solid ${C.red}`, color: C.red, borderRadius: 6,
                        opacity: acct.holding_count > 0 ? 0.4 : 1,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
