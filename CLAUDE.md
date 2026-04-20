# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands assume you are in the repo root unless noted.

### Backend (FastAPI, Python 3.12)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000     # dev server with hot reload
python auth.py 1234                       # generate a bcrypt hash for PIN "1234"
python seed_401k.py                       # one-time manual seeder for 401k holdings
```
There is no test suite. The backend has no linter configured.

### Frontend (Vite 7 + React 19)
```bash
cd frontend
npm install
npm run dev          # Vite dev server on :5173, proxies /api → http://localhost:8000
npm run build        # outputs to frontend/dist (served by FastAPI in prod)
npm run lint         # ESLint flat config (eslint.config.js)
npm run preview      # preview the production build
```

### Full-stack via Docker
```bash
docker compose up -d --build              # builds frontend, then runs Python image on :8000
```
Docker uses a multi-stage build: Node 20 Alpine builds the frontend, then Python 3.12-slim serves everything. The container runs as non-root `appuser`. Production deploys go through Portainer on a UGREEN NAS — see `README.md` for the stack/env-var workflow.

## Architecture

### Single-process FastAPI app serving its own SPA
`backend/main.py` is the entrypoint. In production, the FastAPI app both serves `/api/*` and mounts `frontend/dist` as static files, with a catch-all that falls back to `index.html` for client-side routing. In dev, Vite proxies `/api` to port 8000 (`frontend/vite.config.js`), so the same code path works in both modes.

### Backend modules

| File | Lines | Purpose |
|---|---|---|
| `main.py` | 1,340 | FastAPI app, all HTTP routes, APScheduler, push fan-out |
| `stock_service.py` | 1,954 | yfinance integration, all analytics (technicals, performance, dividends, crypto) |
| `fidelity_csv.py` | 233 | Fidelity 401k CSV parser |
| `database.py` | 146 | SQLite schema, migrations, async context manager |
| `auth.py` | 176 | PIN auth with rate limiting, JWT creation/validation |
| `webauthn_routes.py` | 216 | Passkey registration and verification handlers |
| `seed_401k.py` | 123 | One-time manual seeder for 401k holdings (run manually) |

**`main.py`** — Routes are organized by section comment. Route groups: Auth, WebAuthn, Accounts, Holdings, Settings, Export, Alerts, Import (Fidelity CSV), Performance, Technicals, Price-History, News, Fundamentals, Portfolio-Intelligence, Portfolio-Analytics, Dividend-Calendar, Dividend-History, Dividend-Yearly, Bond-Metrics, Fear-Greed, Crypto-Global, Rebalance, Cache, Data-Reset, Push, Static. All `/api/*` routes use the `require_auth` dependency unless explicitly noted (public: `auth-options`, `auth-verify`).

**`database.py`** — Single SQLite file, opened per-request via `get_db()` async context manager (WAL mode). Schema lives in `SCHEMA_SQL` and is created on startup. **Schema evolution is done by appending `ALTER TABLE` statements to the `migrations` list in `init_db()`** — each migration is wrapped in `try/except pass` so re-running on an already-migrated DB is a no-op. Default settings are seeded via `INSERT OR IGNORE`.

**`stock_service.py`** — Every blocking yfinance call is wrapped in `asyncio.to_thread()` to avoid blocking the event loop. Key functions:
- `validate_ticker(ticker)` — yfinance lookup + type classification (Stock/ETF/Fund/Crypto)
- `refresh_all_prices()` — batch price fetch; for manual holdings applies benchmark's % change
- `get_technicals(ticker)` — RSI, SMA 20/50/200, MACD, support/resistance, trend, alerts, volume vs 30d avg
- `get_portfolio_performance(account_type)` — daily portfolio values vs S&P 500 (weekend forward-filled)
- `get_portfolio_intelligence(account_type)` — sector aggregation with HHI concentration metric
- `get_portfolio_analytics(account_type)` — 3-level drill-down: holdings detail, sector aggregation, risk metrics (VaR 95%)
- `get_dividend_calendar(month, account_type)` — ex-div events + estimated payment dates (15 business days)
- `get_dividend_history(months, account_type)` — monthly income totals
- `get_dividend_yearly_comparison(account_type)` — year-over-year growth rates
- `get_bond_metrics(ticker)` — yield, expense ratio, assets, Morningstar rating, multi-year returns
- `get_rebalance_suggestions(account_type)` — age-based model vs actual; flags concentration risk
- `get_fear_greed()` — Fear & Greed Index from alternative.me (30d history)
- `get_crypto_global()` — BTC/ETH dominance, market cap, volume from CoinGecko

**`auth.py`** — PIN auth with two storage paths: DB-stored hash (`settings.auth_pin_hash`) takes precedence over env-var hash (`AUTH_PIN_HASH`). If neither is set, auth is disabled (first-boot mode). Rate limiting: 5 failures per 15 minutes per IP → 429 Retry-After (in-memory, resets on restart). JWT revocation is via `pin_changed_at` timestamp in the payload — changing PIN invalidates all older tokens.

**`webauthn_routes.py`** — Passkey registration/auth handlers, called from thin wrappers in `main.py`. Challenge stored in-memory (`_current_challenge` dict). Registration deletes all prior credentials (single-user app, not multi-device). `auth-options` / `auth-verify` are public endpoints.

**`fidelity_csv.py`** — Parser for Fidelity 401k CSV exports. Detects CUSIPs (9-char codes) and invalid tickers → marks holding as `is_manual`. Maps category names to asset classes. Skips money market rows. Applies benchmark mapping (e.g., LARGE_CAP → IWD, BOND → AGG) for 401k mutual funds. Reports per-row errors without aborting the import.

### Database schema

8 tables created in `database.py:SCHEMA_SQL`:

| Table | Key columns | Constraint |
|---|---|---|
| `holdings` | `id, ticker, type, shares, avg_cost, target_allocation, current_price, previous_close, last_updated, purchase_date, account_type, account_id, asset_class, is_manual, manual_name, benchmark_ticker` | `UNIQUE(ticker, account_id)` |
| `price_history` | `id, ticker, date, open, high, low, close, volume` | `UNIQUE(ticker, date)` |
| `settings` | `key, value` (key-value store) | `PRIMARY KEY(key)` |
| `webauthn_credentials` | `id, credential_id, public_key, sign_count, created_at` | `UNIQUE(credential_id)` |
| `alerts` | `id, ticker, alert_type, threshold, triggered, triggered_at, created_at` | — |
| `push_subscriptions` | `id, endpoint, p256dh, auth, created_at` | `UNIQUE(endpoint)` |
| `accounts` | `id, name, account_type, institution, created_at` | `UNIQUE(name)` |
| `account_targets` | `account_id, ticker, target_allocation` | — |

**Settings keys**: `auth_pin_hash`, `pin_changed_at`, `monthly_contribution`, `age`, `conservative_rate`, `moderate_rate`, `aggressive_rate`, `projection_years`, `monthly_401k_contribution`.

**Asset class enum** (holdings.asset_class): `large_cap`, `mid_cap`, `small_cap`, `international`, `bond`, `stable_value`, `money_market`, `specialty`, `target_date`, `unclassified`.

**Alert types**: `price_below`, `price_above`, `drift_above`.

### Named accounts model

The `accounts` table introduced named accounts (e.g., "Fidelity Brokerage", "Vanguard 401k"). Holdings now carry both `account_type` and `account_id` (FK to accounts). The uniqueness constraint is `UNIQUE(ticker, account_id)` — the same ticker can exist in multiple named accounts.

Account types: `brokerage`, `401k`, `crypto`, `ira`, `roth_ira`, `hsa`.

`_get_default_account_id(db, account_type)` in `main.py` auto-creates a default named account on first add if none exists. The `account_targets` table mirrors `target_allocation` per account for rebalancing.

Rules to remember:
- **Crypto** tickers are auto-suffixed with `-USD` on insert so they match yfinance's symbology.
- **Manual holdings** (`is_manual=1`) skip yfinance validation and require a `current_price`. They optionally carry a `benchmark_ticker` whose price is fetched on refresh — this is how 401k mutual funds without a public ticker get a price proxy for performance charts.
- Most analytics endpoints accept an `account_type` query param and filter to that subset.

### Daily refresh + alerts + push
APScheduler runs `daily_refresh_and_check` at `REFRESH_HOUR:REFRESH_MINUTE` US/Eastern (default 16:30). It calls `refresh_all_prices()` then `check_alerts()`, which evaluates every untriggered row in `alerts` against current prices/drift, marks triggered rows in the DB, and fans out a Web Push notification via `pywebpush` to every row in `push_subscriptions`. Push delivery failures clean up stale endpoints. The same job is also kicked off once on startup via `asyncio.create_task` and is exposed as `POST /api/holdings/refresh-prices` for manual triggers.

### API cache TTLs (stock_service.py)

| Data | TTL |
|---|---|
| News | 30 min |
| Fundamentals | 24 h |
| Dividend calendar | 1 h |
| Dividend history | 1 h |
| Fear & Greed Index | 15 min |
| Crypto global | 15 min |
| Bond metrics | 24 h |
| S&P 500 benchmark | 3 days |

### Frontend structure

**Component hierarchy:**
```
App
├─ ProtectedRoute → Dashboard
│  ├─ BottomTabBar (STOCK_TABS, STOCK_OVERFLOW, CRYPTO_PRIMARY, CRYPTO_OVERFLOW)
│  ├─ SwipeContainer
│  │  ├─ OverviewTab, AllocationTab, PerformanceTab, ProjectionTab
│  │  ├─ TechnicalsTab, OptionsTab, BondsTab  ← wrapped in ErrorBoundary
│  │  └─ CryptoView
│  │     └─ CryptoOverview, CryptoPositions, CryptoTradeJournal,
│  │        CryptoRiskDashboard, CryptoMarketContext, CryptoSetupScanner
│  ├─ ManageHoldings (modal)
│  ├─ AccountFilterSheet (bottom sheet)
│  └─ PullToRefresh
├─ Settings (PIN/biometric, alerts, push, account management)
└─ Login (PIN + WebAuthn)
```

Sub-components by domain:
- **Dividend**: `DividendCalendar`, `DividendEventsTimeline`, `DividendIncomeSection`, `DividendCalendarSection`, `DividendIntelligence`
- **Analytics**: `PortfolioAnalytics`, `PortfolioPerformanceChart`, `AssetClassBreakdown`, `PositionConcentration`, `SectorAllocation`, `SectorDrillDown`, `DriftAnalysis`
- **Deep dives**: `StockDeepDive`, `FundComparison`, `RebalancePlanner`
- **Accounts**: `AccountFilterSheet`, `AccountManager`
- **UI primitives**: `SkeletonLoader`, `PullToRefresh`, `ErrorBoundary`, `SearchInput`, `HoldingCard`, `SwipeContainer`, `BottomTabBar`

**`src/types.js`** — JSDoc `@typedef` declarations for `Holding`, `PortfolioData`, `Settings`, `Alert`. Reference these for type annotations.

**`src/hooks/useApi.js`** — The single `apiFetch` wrapper attaches the JWT, redirects to `/login` on 401, and exposes a typed `api` object with one method per endpoint. **Always add new endpoints here — never call `fetch` directly from components.**

Adding a new endpoint:
```js
// Standard JSON endpoint
newEndpoint: (params) =>
  apiFetch('/api/path', { method: 'POST', body: JSON.stringify(params) }),

// Query params
getThing: (accountType) =>
  apiFetch(`/api/thing${accountType ? `?account_type=${accountType}` : ''}`),

// File upload (FormData — use raw fetch, not apiFetch)
importFile: (file) => {
  const fd = new FormData();
  fd.append('file', file);
  const token = localStorage.getItem('auth_token');
  return fetch(`${API_BASE}/import/file`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  }).then(/* standard error handling */);
},
```

**`src/hooks/` — full list:**

| Hook | Purpose |
|---|---|
| `useApi.js` | API wrapper + endpoint catalog |
| `useMediaQuery.js` | `useIsMobile()` for `(max-width: 768px)` |
| `useCountUp.js` | Animated number transitions (easeOutCubic) |
| `useStaggeredMount.js` | Cascading fade-in for list renders; returns `{animation, animationDelay}` |
| `useFocusTrap.js` | Trap keyboard focus inside modals; handles Escape callback |
| `useSwipeNavigation.js` | Swipe-to-change-tab gesture with edge dampening |
| `useReducedMotion.js` | Wraps `prefers-reduced-motion`; disable animations when true |

### Styling conventions

There are **no CSS files**. All styles are inline objects assembled from theme tokens.

**`src/styles/theme.js`** exports:
- `C` — core color tokens: `bg`, `card`, `cardHover`, `elevated`, `border`, `borderActive`, `text`, `textMuted`, `textDim`, `green`, `red`, `blue`, `purple`, `amber`, `cyan`, `pink`, `accent`
- `TYPE_COLORS` — per holding type (ETF/Stock/Fund/Crypto)
- `ACCOUNT_COLORS` — per account type
- `ASSET_CLASS_COLORS` / `ASSET_CLASS_LABELS` — per asset class enum value
- `MONO = 'JetBrains Mono'`, `SANS = 'DM Sans'`
- Ticker color palette — 20-color array for chart series

**`src/styles/shared.js`** exports reusable style objects: `cardStyle`, `inputStyle`, `inputGroupWrapper`, `inputAddon`, `buttonPrimary`, `buttonSecondary`, `dangerButton`, `sectionTitle`, `labelStyle`, `tableHeader`, `tooltipStyle`, `badge(color)`, `srOnly`.

Always use these tokens — never hardcode colors or spacing.

### Utility modules (`src/utils/`)

| File | Exports |
|---|---|
| `format.js` | `fmtPct()`, `fmtCurrency()`, `fmtCompact()` — all handle null/NaN safely |
| `haptics.js` | Vibration API wrapper; no-op on unsupported devices |
| `pushNotifications.js` | Web Push subscribe/unsubscribe/permission check helpers |
| `webauthn.js` | Passkey registration and authentication client-side helpers |
| `projections.js` | Portfolio projection calculations used by ProjectionTab |

### State management

No Redux or Zustand — state is lifted to parent or kept component-local.

**Dashboard owns**: `activeTab`, `data`, `settings`, `accountFilter`, `activeAccountId`, `loading`, `refreshing`, `fetchError`, `triggeredAlerts`, modal visibility flags.

**Tabs are pure**: receive `data`/`settings`/`accountFilter` props, render against them, no side effects.

**Modals** (ManageHoldings, Settings): call `api.*` directly, invoke an `onUpdate()` callback on success to trigger Dashboard re-fetch.

Use `useMemo` for expensive filtered/sorted arrays; `useCallback` for event handlers passed as props.

### Service worker (`public/sw.js`)

- `STATIC_CACHE = 'portfolio-v3'` — **bump this string to force all clients to re-download**
- `API_CACHE = 'portfolio-api-v1'`
- SWR paths: `/api/holdings`, `/api/settings` — serves from cache immediately, revalidates in background, posts `API_UPDATED` message to all clients if response body changed
- Network-first for all other `/api/*`
- Cache-first for static assets (JS/CSS/images) and Google Fonts
- Network-first for HTML navigation, falls back to `/offline.html`
- Push event handler: shows notification with vibration + "View" / "Dismiss" action buttons

### Mobile conventions

- Minimum 44px touch targets for all interactive elements
- `env(safe-area-inset-*)` for notch / home-indicator safety margins
- Wrap complex tabs in `<ErrorBoundary>` to isolate rendering failures (OptionsTab, BondsTab, TechnicalsTab already do this)
- Use `useStaggeredMount(index)` + the returned `animation`/`animationDelay` style props for cascading list renders
- Respect `useReducedMotion()` — disable transitions when it returns true

### Auth + transport
- JWT lives in `localStorage.auth_token`. The frontend redirects to `/login` on any 401 (`useApi.js`).
- WebAuthn (passkey) is layered on top: registration requires an active JWT, but `auth-options` / `auth-verify` are public so a passkey can replace PIN entry.
- VAPID keys come from `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env vars; if either is unset, push fan-out silently no-ops.

### Environment variables (set in `.env` or Portainer stack)

| Var | Purpose |
|---|---|
| `AUTH_PIN_HASH` | Bcrypt hash; if empty, auth is disabled. Generate with `python backend/auth.py <PIN>`. |
| `AUTH_PIN` | Plaintext PIN — backend will hash it on boot if `AUTH_PIN_HASH` is unset. Avoid in prod. |
| `JWT_SECRET` | HS256 signing secret. |
| `REFRESH_HOUR` / `REFRESH_MINUTE` | When the daily refresh job runs (US/Eastern). Defaults 16:30. |
| `DATABASE_PATH` | SQLite file path. Docker sets this to `/app/data/portfolio.db` (mounted as a named volume). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push keys; both must be set for notifications to send. |
