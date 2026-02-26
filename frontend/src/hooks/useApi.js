const API_BASE = '/api';

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

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
  login: (pin) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ pin }) }),
  checkAuth: () => apiFetch('/auth/check'),
  getHoldings: () => apiFetch('/holdings'),
  addHolding: (data) => apiFetch('/holdings', { method: 'POST', body: JSON.stringify(data) }),
  updateHolding: (id, data) => apiFetch(`/holdings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHolding: (id) => apiFetch(`/holdings/${id}`, { method: 'DELETE' }),
  refreshPrices: () => apiFetch('/holdings/refresh-prices', { method: 'POST' }),
  getSettings: () => apiFetch('/settings'),
  updateSettings: (settings) => apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),
  getTechnicals: (ticker) => apiFetch(`/technicals/${ticker}`),
  getPriceHistory: (ticker, period) => apiFetch(`/price-history/${ticker}?period=${period}`),
  getPerformance: (accountType) => {
    const params = accountType && accountType !== 'all' ? `?account_type=${accountType}` : '';
    return apiFetch(`/performance${params}`);
  },
  getNews: (ticker) => apiFetch(`/news/${ticker}`),
  getFundamentals: (ticker) => apiFetch(`/fundamentals/${ticker}`),
  getPortfolioIntelligence: (accountType) => {
    const params = accountType && accountType !== 'all' ? `?account_type=${accountType}` : '';
    return apiFetch(`/portfolio-intelligence${params}`);
  },
  getPortfolioAnalytics: (accountType) => {
    const params = accountType && accountType !== 'all' ? `?account_type=${accountType}` : '';
    return apiFetch(`/portfolio-analytics${params}`);
  },
  getFearGreed: () => apiFetch('/crypto/fear-greed'),
  getCryptoGlobal: () => apiFetch('/crypto/global'),
};
