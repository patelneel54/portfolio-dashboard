# Portfolio Dashboard - Implementation Plan

## Tech Stack
- **Backend**: Python 3.12 + FastAPI + SQLite (via aiosqlite)
- **Frontend**: React 18 + Vite 5 + Recharts
- **Stock Data**: yfinance (free, no API key needed)
- **Auth**: PIN/password with bcrypt hash + JWT tokens (72hr sessions)
- **Scheduler**: APScheduler for daily price refresh at market close
- **PWA**: manifest.json + service worker + iOS meta tags
- **Docker**: Multi-stage build (Node for frontend, Python slim for runtime)

## File Structure
```
Finance/
├── backend/
│   ├── main.py              # FastAPI app, routes, scheduler
│   ├── database.py          # SQLite schema, connection management
│   ├── stock_service.py     # yfinance integration, technicals calculation
│   ├── auth.py              # PIN verification, JWT creation/validation
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Router + auth guard
│   │   ├── main.jsx         # Entry point + SW registration
│   │   ├── components/
│   │   │   ├── Dashboard.jsx       # Main shell with tabs
│   │   │   ├── OverviewTab.jsx     # Pie chart, movers, drift cards
│   │   │   ├── AllocationTab.jsx   # Treemap, radar, holdings table
│   │   │   ├── PerformanceTab.jsx  # Gain/loss bars, win rate
│   │   │   ├── ProjectionTab.jsx   # 30yr growth area chart
│   │   │   ├── TechnicalsTab.jsx   # RSI, SMA, support/resistance
│   │   │   ├── ManageHoldings.jsx  # Add/remove stocks modal
│   │   │   ├── Settings.jsx        # Configurable settings page
│   │   │   └── Login.jsx           # PIN entry screen
│   │   ├── hooks/useApi.js         # Fetch wrapper with JWT auth
│   │   └── styles/theme.js         # Dark theme color constants
│   ├── public/
│   │   ├── manifest.json
│   │   └── sw.js
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── .gitignore
```

## Build Phases

### Phase 1: Backend Core
1. `database.py` - SQLite schema (holdings, price_history, settings tables)
2. `auth.py` - PIN hash verification + JWT token generation
3. `stock_service.py` - yfinance price fetching, RSI/SMA/support-resistance calc
4. `main.py` - All API routes + APScheduler daily refresh

### Phase 2: Frontend Foundation
5. Project init (Vite + React + Recharts + react-router-dom)
6. Theme, API hook, App shell with routing
7. Login page + Dashboard shell with tab navigation

### Phase 3: Dashboard Tabs
8. OverviewTab - Allocation pie, top movers bar chart, drift cards
9. AllocationTab - Treemap, radar (target vs actual), full holdings table
10. PerformanceTab - Gain/loss waterfall, winners/losers/win rate
11. ProjectionTab - 30yr area chart (3 scenarios), milestone callouts
12. TechnicalsTab - RSI, SMA, support/resistance, quick scan grid
13. ManageHoldings - Add/edit/remove stocks modal
14. Settings - Contribution amount, age, return rates

### Phase 4: PWA + Docker
15. manifest.json, service worker, iOS meta tags, icons
16. Dockerfile (multi-stage), docker-compose.yml, .dockerignore

## API Endpoints
- `POST /api/auth/login` - PIN verification, returns JWT
- `GET /api/holdings` - All holdings with computed fields
- `POST /api/holdings` - Add stock (validates ticker via yfinance)
- `PUT /api/holdings/{id}` - Update shares/cost/target
- `DELETE /api/holdings/{id}` - Remove stock
- `POST /api/holdings/refresh-prices` - Manual price refresh
- `GET /api/settings` - Get all settings
- `PUT /api/settings` - Update settings
- `GET /api/technicals/{ticker}` - Technical analysis data

## Key Design Decisions
- yfinance calls wrapped in `asyncio.to_thread()` to avoid blocking
- SQLite WAL mode for concurrent read/write safety
- Vite proxy in dev (no CORS issues), FastAPI serves static build in prod
- JWT stored in localStorage, 72hr expiry for mobile convenience
- Docker named volume for SQLite persistence across rebuilds
