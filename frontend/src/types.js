/**
 * @typedef {Object} Holding
 * @property {number} id
 * @property {string} ticker
 * @property {string} type - 'ETF' | 'Stock' | 'Fund' | 'Crypto'
 * @property {number} shares
 * @property {number} avg_cost
 * @property {number} target_allocation
 * @property {number|null} current_price
 * @property {number|null} previous_close
 * @property {string|null} last_updated
 * @property {string|null} purchase_date
 * @property {string} created_at
 * @property {string} account_type - 'brokerage' | '401k' | 'crypto'
 * @property {number} market_value - Computed: shares * current_price
 * @property {number} cost_basis - Computed: shares * avg_cost
 * @property {number} gain_loss - Computed: market_value - cost_basis
 * @property {number} gain_loss_pct - Computed: percentage gain/loss
 * @property {number} actual_allocation - Computed: percentage of total portfolio
 * @property {number} drift - Computed: actual_allocation - target_allocation
 * @property {number} day_change_pct - Computed: daily percentage change
 * @property {string|null} asset_class - 'large_cap' | 'mid_cap' | 'small_cap' | 'international' | 'bond' | 'stable_value' | 'specialty' | 'target_date' | 'money_market' | 'blended'
 * @property {number} is_manual - 0 or 1, whether this is a manually-priced holding
 * @property {string|null} manual_name - Display name for manual/institutional fund holdings
 * @property {string|null} benchmark_ticker - Proxy ticker for auto-refresh of manual holdings
 */

/**
 * @typedef {Object} PortfolioData
 * @property {Holding[]} holdings
 * @property {number} total_value
 * @property {number} total_cost
 * @property {number} total_gain_loss
 * @property {number} total_gain_loss_pct
 * @property {string|null} last_refreshed
 */

/**
 * @typedef {Object} Settings
 * @property {string} monthly_contribution
 * @property {string} monthly_401k_contribution
 * @property {string} age
 * @property {string} conservative_rate
 * @property {string} moderate_rate
 * @property {string} aggressive_rate
 * @property {string} projection_years
 */

/**
 * @typedef {Object} Alert
 * @property {number} id
 * @property {string} ticker
 * @property {string} alert_type - 'price_below' | 'price_above' | 'drift_above'
 * @property {number} threshold
 * @property {boolean} triggered
 * @property {string|null} triggered_at
 * @property {string} created_at
 */
