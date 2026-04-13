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
Production deploys go through Portainer on a UGREEN NAS — see `README.md` for the stack/env-var workflow.

## Architecture

### Single-process FastAPI app serving its own SPA
`backend/main.py` is the entrypoint. In production, the FastAPI app both serves `/api/*` and mounts `frontend/dist` as static files (`main.py:1063+`), with a catch-all that falls back to `index.html` for client-side routing. In dev, Vite proxies `/api` to port 8000 (`frontend/vite.config.js`), so the same code path works in both modes.

### Backend modules
- **`main.py`** — FastAPI app, all HTTP routes, APScheduler setup, push-notification fan-out. Routes are grouped by section comment (Auth, Holdings, Settings, Alerts, Performance, Technicals, Dividends, Crypto, Push, Static). All `/api/*` routes use the `require_auth` dependency unless explicitly noted.
- **`database.py`** — Single SQLite file, opened per-request via the `get_db()` async context manager (WAL mode). Schema lives in `SCHEMA_SQL` and is created on startup; **schema evolution is done by appending `ALTER TABLE` statements to the `migrations` list in `init_db()`** — each migration is wrapped in `try/except pass` so re-running on an already-migrated DB is a no-op. Default settings are seeded via `INSERT OR IGNORE`.
- **`stock_service.py`** — All yfinance integration plus derived analytics (RSI/SMA/support-resistance, portfolio performance vs S&P, dividend calendar, bond metrics, rebalance suggestions, sector exposure, fear/greed). Every blocking yfinance call is wrapped in `asyncio.to_thread()` so it doesn't block the event loop. Holdings are looked up by `(ticker, account_type)`.
- **`auth.py`** — PIN auth with two storage paths: a DB-stored hash (`settings.auth_pin_hash`, set via the Change PIN flow) takes precedence over the env-var hash (`AUTH_PIN_HASH`). If neither is set, auth is disabled entirely (handy for first-boot inside a container before a PIN exists). JWT (HS256, 72-hour expiry) is created on login and validated by the `require_auth` dependency.
- **`webauthn_routes.py`** — Passkey registration/auth handlers, called from thin wrappers in `main.py`.
- **`fidelity_csv.py`** — Parser for Fidelity 401k CSV exports; the `/api/import/fidelity-csv` route upserts into the `holdings` table with `account_type='401k'`.

### Daily refresh + alerts + push
APScheduler runs `daily_refresh_and_check` at `REFRESH_HOUR:REFRESH_MINUTE` US/Eastern (default 16:30). It calls `refresh_all_prices()` then `check_alerts()`, which evaluates every untriggered row in `alerts` against current prices/drift, marks triggered rows in the DB, and fans out a Web Push notification via `pywebpush` to every row in `push_subscriptions`. Push delivery failures clean up stale endpoints. The same job is also kicked off once on startup via `asyncio.create_task` and is exposed as `POST /api/holdings/refresh-prices` for manual triggers.

### Holdings model — three account types share one table
The `holdings` table has a `UNIQUE(ticker, account_type)` constraint so the same ticker can exist independently in `brokerage`, `401k`, and `crypto`. Rules to remember:
- **Crypto** tickers are auto-suffixed with `-USD` on insert (`main.py:365`) so they match yfinance's symbology.
- **Manual holdings** (`is_manual=1`) skip yfinance validation and require a `current_price`. They optionally carry a `benchmark_ticker` whose price *is* fetched on refresh — this is how 401k mutual funds with no public ticker get a price proxy for performance charts.
- Most analytics endpoints accept an `account_type` query param and filter to that subset.

### Frontend structure
- **`src/App.jsx`** — Router (`react-router-dom` v7) with `/login`, `/`, `/settings`. `ProtectedRoute` gates on `localStorage.auth_token`. Listens for `SW_UPDATED` postMessages from the service worker and shows an update banner.
- **`src/components/Dashboard.jsx`** — The shell. Owns `accountFilter` state (defaults to `brokerage`), the active tab, the data fetch, the alerts banner, and the push-notification opt-in prompt. Tabs are lazy children: `OverviewTab`, `AllocationTab`, `PerformanceTab`, `ProjectionTab`, `TechnicalsTab`, `OptionsTab`, `BondsTab`, plus `CryptoView` for the crypto sub-app. Each tab receives the same `data`/`settings`/`accountFilter` props and renders against them.
- **`src/hooks/useApi.js`** — The single `apiFetch` wrapper attaches the JWT, redirects to `/login` on 401, and exposes a typed `api` object with one method per endpoint. **Always add new endpoints here rather than calling `fetch` directly from components.**
- **`src/styles/theme.js` + `src/styles/shared.js`** — Dark-theme color tokens and shared style objects (`cardStyle`, `buttonPrimary`, etc.). Components use inline styles built from these — there is no CSS framework.
- **`public/sw.js`** — Service worker. Caches the SPA shell (`STATIC_CACHE`), does stale-while-revalidate for `/api/holdings` and `/api/settings` (`SWR_PATHS`), and posts `API_UPDATED`/`API_CACHED_AT`/`SW_UPDATED` messages back to clients. Bumping the `STATIC_CACHE` version string is what forces clients to upgrade.
- **`public/manifest.json`** — PWA manifest; the app is designed to be installed to the iPhone home screen and run standalone.

### Auth + transport
- JWT lives in `localStorage.auth_token`. The frontend redirects to `/login` on any 401 (`useApi.js:24`).
- WebAuthn (passkey) is layered on top: registration requires an active JWT, but `auth-options` / `auth-verify` are public so a passkey can replace the PIN entry.
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
