const API_BASE = '/api';

/**
 * Low-level fetch wrapper with auth token management.
 * @param {string} path - API path (e.g., '/holdings')
 * @param {RequestInit} [options] - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    throw new Error('Server unavailable. Check your connection.');
  }

  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }

  return res.json();
}

export const api = {
  /** @param {string} pin @returns {Promise<{token: string}>} */
  login: (pin) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ pin }) }),
  /** @returns {Promise<{status: string}>} */
  checkAuth: () => apiFetch('/auth/check'),
  /** @returns {Promise<import('../types').PortfolioData>} */
  getHoldings: () => apiFetch('/holdings'),
  /** @param {Object} data @returns {Promise<{status: string, ticker: string, type: string}>} */
  addHolding: (data) => apiFetch('/holdings', { method: 'POST', body: JSON.stringify(data) }),
  /** @param {number} id @param {Object} data @returns {Promise<{status: string}>} */
  updateHolding: (id, data) => apiFetch(`/holdings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  /** @param {number} id @returns {Promise<{status: string}>} */
  deleteHolding: (id) => apiFetch(`/holdings/${id}`, { method: 'DELETE' }),
  /** @returns {Promise<{status: string}>} */
  refreshPrices: () => apiFetch('/holdings/refresh-prices', { method: 'POST' }),
  /** @returns {Promise<import('../types').Settings>} */
  getSettings: () => apiFetch('/settings'),
  /** @param {Object} settings @returns {Promise<{status: string}>} */
  updateSettings: (settings) => apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  /** @param {string} ticker @returns {Promise<Object>} */
  getTechnicals: (ticker) => apiFetch(`/technicals/${ticker}`),
  /** @param {string} ticker @param {string} period @returns {Promise<Object[]>} */
  getPriceHistory: (ticker, period) => apiFetch(`/price-history/${ticker}?period=${period}`),
  /** @param {string} [accountType] @returns {Promise<Object>} */
  getPerformance: (accountType) => {
    const params = accountType && accountType !== 'all' ? `?account_type=${accountType}` : '';
    return apiFetch(`/performance${params}`);
  },
  /** @param {string} ticker @returns {Promise<Object>} */
  getNews: (ticker) => apiFetch(`/news/${ticker}`),
  /** @param {string} ticker @returns {Promise<Object>} */
  getFundamentals: (ticker) => apiFetch(`/fundamentals/${ticker}`),
  /** @param {string} [accountType] @returns {Promise<Object>} */
  getPortfolioIntelligence: (accountType) => {
    const params = accountType && accountType !== 'all' ? `?account_type=${accountType}` : '';
    return apiFetch(`/portfolio-intelligence${params}`);
  },
  /** @param {string} month @param {string} [accountType] @returns {Promise<Object>} */
  getDividendCalendar: (month, accountType) => {
    let params = `?month=${month}`;
    if (accountType && accountType !== 'all') params += `&account_type=${accountType}`;
    return apiFetch(`/dividend-calendar${params}`);
  },
  /** @param {number} [months] @param {string} [accountType] @returns {Promise<Object>} */
  getDividendHistory: (months = 12, accountType) => {
    let params = `?months=${months}`;
    if (accountType && accountType !== 'all') params += `&account_type=${accountType}`;
    return apiFetch(`/dividend-history${params}`);
  },
  /** @param {string} [accountType] @returns {Promise<Object>} */
  getPortfolioAnalytics: (accountType) => {
    const params = accountType && accountType !== 'all' ? `?account_type=${accountType}` : '';
    return apiFetch(`/portfolio-analytics${params}`);
  },
  /** @returns {Promise<Object>} */
  getFearGreed: () => apiFetch('/crypto/fear-greed'),
  /** @returns {Promise<Object>} */
  getCryptoGlobal: () => apiFetch('/crypto/global'),
  // Alerts
  /** @param {boolean} [triggered] @returns {Promise<import('../types').Alert[]>} */
  getAlerts: (triggered) => {
    const params = triggered !== undefined ? `?triggered=${triggered}` : '';
    return apiFetch(`/alerts${params}`);
  },
  /** @param {{ticker: string, alert_type: string, threshold: number}} data @returns {Promise<{status: string, id: number}>} */
  createAlert: (data) => apiFetch('/alerts', { method: 'POST', body: JSON.stringify(data) }),
  /** @param {number} id @returns {Promise<{status: string}>} */
  deleteAlert: (id) => apiFetch(`/alerts/${id}`, { method: 'DELETE' }),
  /** @param {number} id @returns {Promise<{status: string}>} */
  dismissAlert: (id) => apiFetch(`/alerts/${id}/dismiss`, { method: 'PATCH' }),
  // Bond metrics
  /** @param {string} ticker @returns {Promise<Object>} */
  getBondMetrics: (ticker) => apiFetch(`/bond-metrics/${ticker}`),
  // Rebalance suggestions
  /** @param {string} [accountType] @returns {Promise<Object>} */
  getRebalanceSuggestions: (accountType) => {
    const params = accountType && accountType !== 'all' ? `?account_type=${accountType}` : '';
    return apiFetch(`/rebalance-suggestions${params}`);
  },
  // Fidelity CSV import
  /** @param {File} file @returns {Promise<{added: number, updated: number, errors: Array}>} */
  importFidelityCSV: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('auth_token');
    return fetch(`${API_BASE}/import/fidelity-csv`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(res => {
      if (!res.ok) return res.json().then(e => { throw new Error(e.detail || 'Import failed'); });
      return res.json();
    });
  },
  // Settings management
  /** @param {string} currentPin @param {string} newPin @returns {Promise<{status: string}>} */
  changePin: (currentPin, newPin) => apiFetch('/auth/change-pin', { method: 'POST', body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }) }),
  /** @param {'csv'|'json'} format @returns {Promise<Blob>} */
  exportData: async (format) => {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${API_BASE}/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) { localStorage.removeItem('auth_token'); window.location.href = '/login'; throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  /** @returns {Promise<{status: string, message: string}>} */
  clearPriceCache: () => apiFetch('/cache/clear', { method: 'POST' }),
  /** @returns {Promise<{status: string}>} */
  resetAllData: () => apiFetch('/data/reset', { method: 'DELETE' }),
  // WebAuthn
  webauthnRegisterOptions: () => apiFetch('/webauthn/register-options', { method: 'POST' }),
  webauthnRegisterVerify: (credential) => apiFetch('/webauthn/register-verify', { method: 'POST', body: JSON.stringify({ credential }) }),
  webauthnAuthOptions: () => apiFetch('/webauthn/auth-options', { method: 'POST' }),
  webauthnAuthVerify: (credential) => apiFetch('/webauthn/auth-verify', { method: 'POST', body: JSON.stringify({ credential }) }),
  webauthnDeleteCredential: () => apiFetch('/webauthn/credential', { method: 'DELETE' }),
  webauthnStatus: () => apiFetch('/webauthn/status'),
};
