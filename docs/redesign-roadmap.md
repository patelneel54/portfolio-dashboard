# Portfolio Command Center — Redesign Roadmap for AI Agents

**Status:** active · **Branch:** `claude/jolly-maxwell-an9ntl` · **Last updated:** 2026-09-17
**Demo of the target experience:** https://claude.ai/artifact/Mi14bW7HB2xtHnwQVEtgse (private; sample data)

This file is the single source of truth for turning the current app into the redesigned one. It was produced from a full code audit of `backend/` and `frontend/`, a five-advisor LLM-council review, and a plan the owner approved. **Do not re-derive the diagnosis — implement the tasks.**

---

## 0. How to use this document (read this first)

1. Read `CLAUDE.md` for commands and architecture, then this file. Nothing else is required context.
2. Pick the lowest-numbered task in §6 whose **Depends on** are all `done` in §8. Work one task per commit (or PR). Start the commit subject with the task ID, e.g. `P1-05: rebuild holdings table without legacy UNIQUE`.
3. Every task has **Acceptance criteria** and **Verify** commands. Run them before pushing. If they fail, the task is not done.
4. When finished, update the task's row in §8 (status, commit SHA, notes). If you deviated from the steps, say why in *Notes*.
5. Hard rules that apply to every task:
   - **Never skip, disable or quarantine a test to get green.** Fix the cause.
   - **Back up `portfolio.db`** (copy the file) before running any task that touches `database.py` migrations. In Docker the file is `/app/data/portfolio.db` on the `portfolio_data` volume.
   - **Bump `STATIC_CACHE` in `frontend/public/sw.js`** whenever the response shape of `/api/holdings` or `/api/settings` changes — the service worker serves those stale-while-revalidate and an installed iPhone PWA will otherwise keep the old shape.
   - **Do not modify the parked Tools components** (`TechnicalsTab.jsx`, `OptionsTab.jsx`, `BondsTab.jsx`, `CryptoSetupScanner.jsx`, `CryptoTradeJournal.jsx`, `CryptoRiskDashboard.jsx`) except to move or lazy-load them (P4-02). They are out of scope by owner decision.
   - **No brokerage-aggregation APIs (Plaid, SnapTrade), no LLM-based CSV parsing, no paid data sources.** Data comes from yfinance and user-provided statements. Importers are deterministic.
   - **Auth must keep working when no PIN is configured** (`auth.py` disables auth on first boot inside the container). Don't break that path.
   - Frontend: no new CSS framework, no emoji as icons, `font-variant-numeric: tabular-nums` on every number, 44 pt minimum touch targets, safe-area insets respected, `prefers-reduced-motion` respected, no horizontal page scroll at 375 px.
   - Match surrounding code style. Backend: async, `get_db()` context manager, `asyncio.to_thread` around yfinance. Frontend: functional components, `api` object in `hooks/useApi.js` for every endpoint.
6. There is no CI. `npm run lint` currently reports 36 **pre-existing** errors in files this roadmap replaces or deletes; a task is lint-clean when the files it touched have zero errors (`npx eslint <file>`).

---

## 1. Why this roadmap exists

The owner's complaints: the iPhone PWA feels unfinished; there's no easy way to import stocks or multiple brokerage accounts; the UI is clunky; "the logic behind the app is not that good"; it should show every asset type in one clean, Robinhood-grade interface.

The audit found the complaints are accurate and share one root cause: **the data model**. `holdings` stores one mutable `avg_cost` per (ticker, account) with no cash, no transactions and — until 2026-09-17 — no daily valuation history. Every P&L, performance, dividend and drift number is derived from that snapshot, and several derivations are simply wrong today (see §5). Layered on top: 7 stock tabs + 6 crypto tabs driven by two different tab systems, three import entry points for one parser, 100 % inline styles with no token system, tab state not in the URL, no toast system, haptics that are a no-op on iOS.

The council's verdict, adopted by the owner:

- **It's a personal balance sheet, not a trading app.** Many accounts, one net worth, end-of-day prices the UI is honest about. The hero interaction is scrubbing *daily* history.
- **Fix the model first, then the paint.** A snapshot-primary hybrid: positions are truth, `valuation_snapshots` give history, `transactions` is an automatic audit trail of import diffs (no manual trade logging).
- **One deterministic importer** with presets + a column mapper + a diff preview, and a four-tap manual add with ticker search.
- **Quarantine the calculators** (Technicals, Options, Bonds, crypto tools) under a Tools menu, lazy-loaded, untouched.
- **Strangler, not rewrite.** New URL-routed shell wraps the old tabs; screens are replaced one at a time; old code is deleted last.

### Already shipped

| Commit | What | Why it went first |
|---|---|---|
| `d1c518b` | `refresh_all_prices` no longer compounds the benchmark's day move into manual 401k prices on every run (once per UTC day, keyed on `last_updated`, updates by row id). New `valuation_snapshots` table; `daily_refresh_and_check` and `POST /api/holdings/refresh-prices` write one row per holding per US/Eastern date (`INSERT OR REPLACE`). `Dashboard.jsx` default account filter is `'all'`. | Every day without it lost a day of chart history and drifted 401k prices further from the truth. |

### Owner decisions (do not re-open)

| # | Decision |
|---|---|
| D1 | Accounts held: **Fidelity 401k, one taxable brokerage, one crypto exchange.** Presets ship for Fidelity, Schwab, Robinhood, Coinbase + Generic. Cash/HSA/real-estate are supported by the model, not surfaced in the UI until present. |
| D2 | Data upkeep is **re-import statements periodically**. `transactions` is populated only by import diffs and in-app edits (`source ∈ {import_diff, manual_edit}`). No trade-entry UI. |
| D3 | Technicals / Options / Bonds / crypto Journal-Scanner-Risk are **parked under `/more/tools`**, lazy-loaded, untouched. |
| D4 | The hotfix (`d1c518b`) shipped before the demo. |
| D5 | Palette and type stay the app's existing `theme.js` tokens and DM Sans + JetBrains Mono (not Inter). |

---

## 2. Non-negotiable constraints

- **Single user**, self-hosted: Docker image built by `Dockerfile`, deployed with Portainer on a UGREEN NAS (`README.md`). SQLite via `aiosqlite`, WAL mode, one file.
- **Schema evolution:** append to the `migrations` list in `backend/database.py:init_db()`. New tables go in `SCHEMA_SQL` (`CREATE TABLE IF NOT EXISTS`). **Constraint changes require a table rebuild** (create-copy-drop-rename) because SQLite cannot drop an index that backs a table-level `UNIQUE` (see B01). After P1-04, migration failures are logged, not swallowed.
- **Market data:** yfinance only, end-of-day, refreshed at `REFRESH_HOUR:REFRESH_MINUTE` US/Eastern (default 16:30) plus once on startup. Rate-limit-friendly: batch requests, cache with TTL, never fetch inside a per-holding loop.
- **Primary surface is an iPhone PWA** installed to the home screen (`frontend/index.html` apple meta, `public/manifest.json`, `public/sw.js`). Design for 375 px first; desktop is a wider version of the same layout, never a different one.
- **Design tokens** (from `frontend/src/styles/theme.js`, to be promoted to CSS variables in P3-01): bg `#0B0B0F`, card `#16161D`, card-hover `#1E1E27`, elevated `#26263A`, border `#2A2A3A`, text `#F0F0F5`, muted `#8E8EA0`, dim `#5A5A6E`, gain `#00DC5A`, loss `#FF3B30`, info `#636AFF`, warn `#FFB020`; account colours 401k `#A855F7`, brokerage `#636AFF`, crypto `#F7931A`. Fonts DM Sans (UI) + JetBrains Mono (tables/tickers). Radii 8/12/16. Spacing 4/8/12/16/24/32. Motion 150/250 ms.
- **Auth:** PIN (bcrypt) → JWT HS256 72 h; WebAuthn passkey layered on top; `require_auth` returns immediately when no PIN exists. Keep all of it.

---

## 3. Target architecture

### 3.1 Navigation (bottom bar, 5 slots, every screen has a URL)

```
/                 Home        net worth hero · scrub chart (1W/1M/3M/YTD/1Y/ALL) · "as of" label · account cards · today's movers · triggered alerts
/holdings         Holdings    every position across accounts · group by account | asset class · search · sort sheet · tap → detail
/add              (+)         sheet: Add position (4 taps) | Import statement (preset → mapping → diff → confirm)
/insights         Insights    allocation donut · performance vs S&P (TWR) · dividends · projections — the existing analytics, consolidated
/more             More        Tools (parked) · Alerts · Accounts · Settings · Explain-numbers toggle · About
/accounts/:id     Account detail   same hero, scoped · cash row · positions · statement (last import, preset, Import button) · activity
/holdings/:id     Holding detail   price hero + chart · position card (value, qty, avg cost, total return, today, % of net worth) · dividends · activity · "Open in Technicals"
/more/tools/:tool Parked tool      the existing component, React.lazy
```

The account filter is a chip on Home (and Holdings) that scopes to one account; default **all**. Crypto is an account, not a mode — `CryptoView`'s six tabs collapse into Account detail + Tools.

### 3.2 Data model (target)

```
accounts            id, name UNIQUE, kind ∈ {brokerage,401k,ira,roth_ira,hsa,crypto,cash,other}, institution, cash_balance REAL DEFAULT 0, created_at
instruments         id, symbol UNIQUE (yfinance symbol, e.g. BTC-USD; synthetic for proxy/manual), name, asset_type ∈ {stock,etf,fund,crypto,bond,cash,option,real_estate,other},
                    valuation_source ∈ {yfinance,proxy,manual}, benchmark_symbol, asset_class, sector, last_price, previous_close, last_updated
holdings (=positions) id, account_id FK, ticker (→ instruments.symbol), shares, avg_cost, current_price, previous_close, target_allocation, purchase_date,
                    is_manual, manual_name, benchmark_ticker, asset_class, last_updated  — UNIQUE(ticker, account_id) ONLY
valuation_snapshots id, date, holding_id, account_id, ticker, quantity, price, value, created_at — UNIQUE(date, holding_id)   ← exists since d1c518b
transactions        id, account_id, ticker, kind ∈ {buy,sell,dividend,deposit,withdrawal,fee}, quantity, price, amount, date, source ∈ {import_diff,manual_edit}, note, created_at
import_profiles     id, account_id FK, preset, column_map JSON, created_at
account_targets     (exists) account_id, ticker, target_allocation — becomes the ONLY source of targets; holdings.target_allocation is deprecated
```

Keep the `holdings` table name (the frontend and 40+ query sites use it); `instruments` is additive and populated lazily (P1-06). Cash is `accounts.cash_balance`, valued at 1.

**Return metric:** time-weighted return chained from daily `valuation_snapshots`, with dates that carry a `transactions` row of kind buy/sell/deposit/withdrawal excluded from the chain (their effect is a flow, not a return). "Contributions vs. gains" is shown only from the first recorded flow onward — never back-filled.

### 3.3 Frontend primitives (P3-01, `frontend/src/ui/`)

`Screen`, `TopBar` (back + title + action), `BigNumber` (uses `hooks/useCountUp.js`), `DeltaChip` (sign + colour + sr-only "gain/loss" text), `ScrubChart` (SVG path + pointer events + rAF; recharts stays for Insights only), `Row` (avatar · title/subtitle · value/delta), `Card`, `SegmentedControl` (the one and only tab idiom), `Sheet` (bottom sheet: drag-to-dismiss from `AccountFilterSheet.jsx`, focus trap from `hooks/useFocusTrap.js`, body scroll lock), `Toast` (context + `useToast()`), `Skeleton` (from `SkeletonLoader.jsx`, sized to match the real layout), `EmptyState`, icons from `lucide-react`.

### 3.4 Reuse — don't rewrite these

| Keep | Path | Note |
|---|---|---|
| number formatting | `frontend/src/utils/format.js` | `fmtCurrency`, `fmtPct`, `fmtCompact` with `—` for null. Use everywhere; delete local `fmtK`s. |
| count-up | `frontend/src/hooks/useCountUp.js` | Unused today; it is the BigNumber animation. |
| focus trap | `frontend/src/hooks/useFocusTrap.js` | Used by one modal today; every Sheet must use it. |
| pull to refresh | `frontend/src/components/PullToRefresh.jsx` | Solid; keep. Only checks `window.scrollY`, so the new shell must keep the document as the scroll container. |
| sheet drag pattern | `frontend/src/components/AccountFilterSheet.jsx` | Lift the touch-drag/dismiss logic into `ui/Sheet`. |
| skeletons | `frontend/src/components/SkeletonLoader.jsx` | Primitives are fine; the full-page composition must be resized to the new Home. |
| error boundary | `frontend/src/components/ErrorBoundary.jsx` | Wrap every Insights card and every parked tool. |
| chart conventions | `frontend/src/components/PortfolioPerformanceChart.jsx:298-327` | `axisLine={false} tickLine={false}`, dashed horizontal grid, custom tooltip, gain/loss stroke. Reuse in Insights. |
| API wrapper | `frontend/src/hooks/useApi.js` | Keep `apiFetch` and the `api` object; add methods, never `fetch` from components. |
| migrations | `backend/database.py:init_db()` | Append; but see B01 for the rebuild pattern. |
| Fidelity parser | `backend/fidelity_csv.py` | Becomes `backend/importers/fidelity.py` after P1-10 fixes. `CATEGORY_MAP` and `BENCHMARK_MAP` are correct and reused. |
| refresh job | `backend/main.py:daily_refresh_and_check` | Already writes snapshots; P1-08 reads them. |

---

## 4. What the demo proves (so you build the same thing)

Open the artifact on a phone. It is a faithful spec of the screens in §3.1 using the real token palette and the owner's real 401k fund list. Behaviours to replicate exactly:

- Home hero shows full-precision currency (`$63,124.74`, never `$63.1k`), a range delta with arrow/sign/colour, a separate "today" delta, and the line **"EOD prices · as of Wed, Sep 16, 4:30pm ET"**.
- Scrubbing the chart updates the hero number and shows the date; releasing restores the latest values without re-animating.
- Holdings rows: avatar initials · ticker + account badge (+ `proxy` badge for benchmark-priced funds) · name and quantity · value · day %. Group headers show group value and % of net worth.
- Add position = search (name + EOD price shown) → quantity (live `≈ $value`) → optional cost (prefilled with price) → account → Save → toast + row highlight via `?new=<id>`.
- Import = pick account → upload/paste → detected preset + column mapping shown → **diff** with New / Changed / Removed / Unchanged / Skipped and per-row include toggles → Apply → toast → account detail shows activity entries.
- "Explain every number" toggle reveals the formula/field behind each figure (`data-explain`). Keep this in the real app — it is the trust feature.

---

## 5. Bug register

Line numbers are as of commit `d1c518b`. Each bug is closed by exactly one task in §6.

| ID | Where | Symptom | Root cause | Fix | Proof | Task |
|---|---|---|---|---|---|---|
| B01 | `backend/database.py:21` + `:123` | Same ticker in two brokerage accounts → HTTP 500 (`IntegrityError`); the named-accounts feature from `01f9c69` is silently broken on every DB | `SCHEMA_SQL` still declares table-level `UNIQUE(ticker, account_type)`; the migration `DROP INDEX IF EXISTS sqlite_autoindex_holdings_1` is refused by SQLite and swallowed by `except Exception: pass` (`:148-149`) | Table rebuild: create `holdings_new` with only `UNIQUE(ticker, account_id)`, copy, drop, rename; then recreate `idx_holdings_ticker_account_id` | Test inserts `VOO` into two accounts of type `brokerage`; `PRAGMA index_list(holdings)` shows no autoindex on `(ticker, account_type)` | P1-05 |
| B02 | `backend/main.py:471-474`, `:79-96` | Every 401k/crypto holding reports `drift == actual_allocation`; `drift_above` alerts fire immediately and forever for anyone with a 401k | `actual_allocation` is `market_value / total_value` over ALL holdings while `target_allocation` only exists for brokerage rows; `holdings_by_ticker` (`:79`) collapses the same ticker across accounts | Compute allocation and drift **per account** against that account's total; read targets from `account_targets`; alert evaluation keyed by `(ticker, account_id)` | Test: a 401k-only DB yields `drift == 0` for all rows and no `drift_above` trigger; a brokerage target set sums to 100 within the account | P1-07 |
| B03 | `backend/stock_service.py:417-487` | Performance chart shows fabricated multi-hundred-percent returns when tickers have different history lengths; `benchmark_values` contains `null`s | Today's share counts applied to all history; forward-fill only (`:470-473`), so early dates sum only the tickers whose history has started | Build the series from `valuation_snapshots`; for dates before snapshots exist, back-fill each ticker from its first close (never partial sums); align benchmark by forward-filling `^GSPC` on non-trading days | Test with two tickers of 30 and 90 days of history: first value ≈ full portfolio, no `null` in benchmark | P1-08 |
| B04 | `backend/stock_service.py:1196` | "Annual income" is one month's dividends × 12 (4× overstated in a quarterly payer's month, 0 otherwise) | `annual_income_estimate = round(total * 12, 2)` | Sum trailing-12-month dividend events × current shares | Test: quarterly payer → annual = 4 × one payment | P1-09 |
| B05 | `backend/stock_service.py:1392` | Yearly dividend comparison reports per-share growth as income growth | Each historical year multiplied by **today's** share count | Use shares held at each year end (from `valuation_snapshots`, else `transactions`, else today's with an `estimated: true` flag) | Test: shares doubled last year → income growth ≠ per-share growth | P1-09 |
| B06 | `backend/stock_service.py:1529-1530`, `:~942` | Dividend yields displayed as `0.01%` or `113%` depending on yfinance version | `dividend_yield` unit differs by yfinance version/asset type; raw value passed through | Normalise once in `get_fundamentals`: if value < 1 treat as ratio × 100, else percent; pin `yfinance` in `requirements.txt` | Test both units normalise to the same percent | P1-09 |
| B07 | `backend/stock_service.py:951` | Yield-on-cost understated for accounts holding manual funds | Denominator `total_cost` spans all holdings; numerator can only accrue from non-manual ones | Denominator = cost of holdings that contributed income; manual rows reported separately with `income: null`, not `0` | Test: 40 % manual portfolio gives the same YOC as its non-manual subset | P1-09 |
| B08 | `backend/fidelity_csv.py:126` | Funds named "…TOTAL…" (e.g. `FID TOTAL INTL IDX`, `FID TOTAL MARKET INDEX`) are silently dropped from imports | Unanchored substring skip list `['account total', 'total', 'pending']` | Skip only rows whose name **equals** `Account Total`/`Total` or **starts with** `Pending`; never a substring in the middle | Golden CSV with `FID TOTAL INTL IDX` imports it | P1-10 |
| B09 | `backend/fidelity_csv.py:83`, `:193-194` | `($1,234.56)` (accounting negative) parses as `+1234.56` | `re.sub(r'[^\d.\-]', '', value)` strips the parentheses | Detect `(…)` → negative before stripping; reject interior hyphens with a clear error | Golden CSV with a parenthesised loss keeps the sign | P1-10 |
| B10 | `backend/fidelity_csv.py:109-113` | Some exports return "No holdings found" | Header auto-detect latches on a preamble line like `Account Name: …` because it contains `name` | Choose the first line that contains ≥ 3 known header tokens **and** ≥ 4 commas | Golden CSV with a preamble line parses | P1-10 |
| B11 | `backend/main.py:1014`, `:959-1041` | Re-importing a month later reports a month's move as "today's change"; a failure mid-import leaves a half-applied statement | `previous_close = existing.current_price or entry.current_price`; a new connection + commit per row | `previous_close` = imported price (day change 0 until next refresh); whole import in one transaction | Test: import twice with different prices → `day_change_pct == 0` after the second; a row that raises rolls back all rows | P1-11 |
| B12 | `backend/main.py:751-766` | Any authenticated client can read the PIN hash and overwrite it without knowing the current PIN | `GET /api/settings` returns every key; `PUT` does `INSERT OR REPLACE` for any key | Strip `auth_pin_hash`/`pin_changed_at` from GET; reject them in PUT (400); the only PIN write path is `change_pin` | Test: PUT with `auth_pin_hash` → 400; GET has no such key | P1-03 |
| B13 | `backend/main.py:1338-1340` | Unauthenticated path traversal from the SPA catch-all can read files outside `frontend/dist` (e.g. the DB) | `FRONTEND_DIR / path` with no `resolve()`/containment check | `resolved = (FRONTEND_DIR / path).resolve(); if not resolved.is_relative_to(FRONTEND_DIR.resolve()): serve index.html` | Test: `GET /%2e%2e/%2e%2e/backend/portfolio.db` → index.html, 200, HTML | P1-03 |
| B14 | `backend/database.py` (no `PRAGMA foreign_keys`), `account_targets` | `ON DELETE CASCADE` never fires; `account_targets` is written (`main.py:~592`, `:~703`) and never read | FK enforcement off by default in SQLite; feature half-built | `PRAGMA foreign_keys=ON` in `get_db()`; P1-07 reads `account_targets` | Test: deleting an account cascades its targets | P1-03, P1-07 |
| B15 | `backend/stock_service.py:867`, `:1494`, `:159-174` | `portfolio-intelligence` / `portfolio-analytics` take 20-40 s on a cold cache; refresh does N HTTP round trips | `await get_fundamentals()` in a `for` loop; `_fetch_prices_sync` loops `yf.Ticker(t).fast_info` | `asyncio.gather` with a semaphore; `yf.Tickers(" ".join(tickers))` / `yf.download` for quotes; in-memory quote cache with 15-min TTL | Timing test: 20 tickers < 5 s warm, one batch call observed in a mock | P1-12 |
| B16 | `backend/stock_service.py:339` vs `main.py:~458`; `:387-417` | Technicals price ≠ Holdings price for the same ticker; "support/resistance" levels are invented (`levels[-1] * 0.95`) and can sit on the wrong side of price | Two price sources populated by different calls; padding synthetic levels indistinguishably | Technicals use `holdings.current_price` for "price"; return only real pivot levels with `count` ≤ found, sorted nearest-first; label estimated fields | Test: fewer than 3 pivots → fewer than 3 levels returned, none synthetic | P1-13 |
| B17 | `backend/main.py:945-951`, `:640`, `:317-329`, `:170` | `dismiss_alert` returns `ok` for a nonexistent id; `"datetime_now"` magic string in `update_holding`; `_get_default_account_id` commits mid-request; CORS allow-list hardcoded to localhost | Small fragilities | 404 on missing alert; replace placeholder with a `set_last_updated=True` flag; don't commit inside the helper; CORS from an env var with a localhost default | Unit tests for each | P1-13 |

Frontend rough edges (not numbered; closed by P3/P4 tasks): tab state not in URL (P3-02); no `React.lazy` (P3-02); `window.confirm` in `AccountManager.jsx:87` and `Settings.jsx:809` (P3-08); no toast system (P3-08); duplicated add form desktop/mobile in `ManageHoldings.jsx` (P2-05 replaces it); desktop inputs at 13 px trigger iOS zoom (P3-01: inputs are 16 px); haptics via `navigator.vibrate` no-op on iOS (P3-11); skeleton sizes ≠ real layout (P3-04); `$12.3k` totals (P3-09); `SkeletonLoader`/`Stat` padding mismatch (P3-04); five tab idioms (P3-01 SegmentedControl); double safe-area padding (`index.html:30-32` + `Dashboard.jsx:197`) (P3-11); 14 `overflowX:auto` regions without momentum scroll (P3-11); dead code `DividendIntelligence.jsx`, `SectorAllocation.jsx`, `useStaggeredMount.js` (P4-04); SVG splash images iOS won't render (P3-10); `manifest.json` missing `scope`/`id`, `orientation: any` (P3-10).

---

## 6. Task catalog

Template: **ID · Title** — Size S/M/L · Depends on · then Goal / Files / Steps / Acceptance / Verify / Notes.

### Phase 1 — Trust the backend

#### P1-01 · Test scaffold — S · depends on: —
**Goal:** a `pytest` suite exists and runs in under 10 s with no network.
**Files:** `backend/tests/__init__.py`, `backend/tests/conftest.py`, `backend/tests/fixtures/`, `backend/requirements-dev.txt`, `CLAUDE.md` (replace "There is no test suite").
**Steps:** 1) `requirements-dev.txt`: `pytest`, `pytest-asyncio`, `httpx`. 2) `conftest.py`: a `db_path` fixture that sets `DATABASE_PATH` to a `tmp_path` file **before** importing `database`, runs `init_db()`, yields; a `client` fixture using `httpx.AsyncClient(app=main.app)` with auth disabled (no PIN set); a `no_network` autouse fixture that monkeypatches `stock_service._fetch_prices_sync`, `_fetch_history_sync`, `get_fundamentals` and `yf.Ticker` to raise unless a test overrides them. 3) One smoke test: `GET /api/holdings` on an empty DB returns `total_value == 0`.
**Acceptance:** `cd backend && pytest -q` passes; no test touches the network.
**Verify:** `cd backend && pip install -r requirements-dev.txt && pytest -q`.
**Notes:** yfinance imports pandas at module import; that's fine, just never call it.

#### P1-02 · Golden Fidelity fixtures and parser tests — S · depends on: P1-01
**Goal:** the Fidelity parser's behaviour is pinned by real-shaped files before it is changed.
**Files:** `backend/tests/fixtures/fidelity_positions_basic.csv`, `fidelity_positions_edge.csv`, `backend/tests/test_fidelity_csv.py`.
**Steps:** 1) `basic.csv`: the 16-column "Portfolio Positions" export header (`Account Number,Account Name,Symbol,Description,Quantity,Last Price,…,Cost Basis Total,Average Cost Basis,Type`) with the ten funds from `backend/seed_401k.py` (three with a blank Symbol), a `Pending Activity` row, and the two-line footer disclaimer. 2) `edge.csv`: a preamble line `Account Name: 401(K) PLAN` before the header, a fund named `FID TOTAL INTL IDX`, a `($1,234.56)` cost basis, a `SPAXX**` symbol, `BRK.B`. 3) Tests assert current **expected** behaviour (i.e. they fail on B08/B09/B10 today — mark those `xfail(strict=True)` with the bug ID so P1-10 flips them).
**Acceptance:** tests exist for: row count, manual detection, benchmark mapping, skip of `Pending Activity`, the three xfails.
**Verify:** `pytest backend/tests/test_fidelity_csv.py -q` → passes with 3 xfailed.

#### P1-03 · Security fixes — S · depends on: P1-01
**Goal:** close B12, B13, B14 (pragma) and the CORS part of B17.
**Files:** `backend/main.py` (`get_settings`, `update_settings`, `serve_frontend`, CORS block), `backend/database.py` (`get_db`).
**Steps:** 1) `get_settings`: exclude `auth_pin_hash`, `pin_changed_at`. 2) `update_settings`: reject those keys with 400; whitelist is simpler — accept only keys in `DEFAULT_SETTINGS` plus `refresh_*`. 3) `serve_frontend`: resolve and contain; fall back to `index.html` outside the dir. 4) `get_db`: `await db.execute("PRAGMA foreign_keys = ON")` after connect. 5) CORS: `os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")`; document in `CLAUDE.md` env table.
**Acceptance:** tests for each; existing routes unchanged otherwise.
**Verify:** `pytest -q backend/tests/test_security.py`.

#### P1-04 · Migration hygiene — S · depends on: P1-01
**Goal:** migrations can't fail silently; the schema has a version.
**Files:** `backend/database.py`.
**Steps:** 1) Replace `except Exception: pass` with: catch `sqlite3.OperationalError`, and only swallow messages matching `duplicate column name|already exists|no such index`; log everything else with the statement text and re-raise. 2) Add `schema_version` to `settings` (seed `"1"`); each migration entry becomes `(version, sql_or_callable)`; run only entries with version > current; write the new version after each. 3) Keep existing entries as version 1 (idempotent already).
**Acceptance:** running `init_db()` twice on a fresh DB is a no-op the second time; a deliberately broken migration raises.
**Verify:** `pytest -q backend/tests/test_migrations.py`.

#### P1-05 · Rebuild `holdings` without the legacy UNIQUE (B01) — M · depends on: P1-04
**Goal:** the same ticker can live in two accounts of the same type.
**Files:** `backend/database.py` (new migration v2, `SCHEMA_SQL` for fresh DBs), `backend/main.py:add_holding` (duplicate pre-check already keys on `account_id`; return 409 not 500).
**Steps:** 1) Fresh-DB `SCHEMA_SQL`: remove `UNIQUE(ticker, account_type)` from `holdings`; keep `CREATE UNIQUE INDEX idx_holdings_ticker_account_id`. 2) Migration v2 (a callable): `PRAGMA foreign_keys=OFF` → `BEGIN` → `CREATE TABLE holdings_new (…all current columns incl. migrated ones…)` → `INSERT INTO holdings_new SELECT … FROM holdings` → `DROP TABLE holdings` → `ALTER TABLE holdings_new RENAME TO holdings` → recreate the unique index → `COMMIT` → `PRAGMA foreign_keys=ON`. Rows with `account_id IS NULL` get the `Default <account_type>` account first (reuse the v1 statements). 3) Guard: if `holdings` already lacks the autoindex (`PRAGMA index_list`), skip.
**Acceptance:** B01 test passes; a copied production DB migrates and `SELECT COUNT(*)` is unchanged; `valuation_snapshots.holding_id` values still resolve (ids are preserved by the copy — copy `id` explicitly).
**Verify:** `pytest -q backend/tests/test_migrations.py -k rebuild`; manual: `cp portfolio.db /tmp/p.db && DATABASE_PATH=/tmp/p.db python -c "import asyncio,database;asyncio.run(database.init_db())"` twice.
**Notes:** **Back up the DB before deploying this.** The deploy note goes in the commit body.

#### P1-06 · `instruments`, `transactions`, `import_profiles` tables — M · depends on: P1-05
**Goal:** the target model exists; nothing reads it yet except tests.
**Files:** `backend/database.py`, `backend/models.py` (new: pydantic models for the three tables), `backend/main.py` (`GET/POST /api/transactions`).
**Steps:** 1) Tables per §3.2 in `SCHEMA_SQL` (fresh) and migration v3 (existing). 2) `accounts.cash_balance REAL NOT NULL DEFAULT 0` (migration v3). 3) Backfill `instruments` from distinct `holdings.ticker` (symbol, name = `manual_name` or ticker, asset_type from `type`, valuation_source from `is_manual`/`benchmark_ticker`). 4) `GET /api/transactions?account_id=&ticker=&limit=` and `POST /api/transactions` (used by imports/edits only; not a UI). 5) Hook: `update_holding` and `delete_holding` write a `transactions` row (`source=manual_edit`) for share changes.
**Acceptance:** tables exist; editing shares via `PUT /api/holdings/{id}` produces a `buy`/`sell` row with the delta.
**Verify:** `pytest -q backend/tests/test_transactions.py`.

#### P1-07 · Per-account allocation, drift and targets (B02, B14) — M · depends on: P1-06
**Goal:** allocation and drift are computed within an account; targets come from `account_targets`.
**Files:** `backend/main.py` (`list_holdings`, `check_alerts`, `add_holding`/`update_holding` target writes), `backend/stock_service.py:get_rebalance_suggestions`, `frontend/src/components/Dashboard.jsx:168-184` (stop recomputing drift client-side once the API is right).
**Steps:** 1) `list_holdings`: compute `account_total` per `account_id`; `actual_allocation = market_value / account_total`; `target_allocation` from `account_targets` (LEFT JOIN); `drift` only when a target row exists, else `null`. Add `portfolio_allocation = market_value / total_value` as a separate field. 2) `check_alerts`: iterate holdings keyed by `(ticker, account_id)`; `drift_above` uses the per-account drift; price alerts evaluate every account's row. 3) `get_rebalance_suggestions`: sum raw values before rounding; classify `target_date` as blended (60/40) and `crypto` as its own bucket so `other_pct` is never negative. 4) Frontend: remove the client-side drift recompute; read `drift`/`actual_allocation`/`portfolio_allocation` from the API. Bump `STATIC_CACHE`.
**Acceptance:** B02 tests; existing Allocation tab still renders (it consumes `drift` and `actual_allocation`).
**Verify:** `pytest -q backend/tests/test_allocation.py`; `cd frontend && npm run build`.

#### P1-08 · Net-worth history from snapshots; TWR (B03) — M · depends on: P1-06
**Goal:** the chart series is real and the return metric is defined.
**Files:** `backend/stock_service.py` (`get_portfolio_performance` rewritten; new `get_net_worth_history(range, account_id)`), `backend/main.py` (`GET /api/net-worth/history?range=1W|1M|3M|YTD|1Y|ALL&account_id=`), `frontend/src/hooks/useApi.js`.
**Steps:** 1) Series = `SELECT date, SUM(value) FROM valuation_snapshots [WHERE account_id=?] GROUP BY date` + `cash_balance`. 2) For dates before the first snapshot (only when the range asks for them), synthesise from `price_history` per ticker using **today's** shares but starting every ticker at its **own** first close and marking those points `estimated: true`; never partial-sum. 3) TWR: daily returns `v[t]/v[t-1] - 1` chained, skipping dates with a flow transaction; expose `twr_pct`. 4) Benchmark: `^GSPC` closes forward-filled to every date in the series (no `null`). 5) Response: `{dates[], values[], benchmark_values[], estimated_from: date|null, twr_pct, change_abs, change_pct, as_of}`.
**Acceptance:** B03 test; a portfolio with 5 days of snapshots returns exactly 5 real points for `1W` and flags older ones estimated.
**Verify:** `pytest -q backend/tests/test_performance.py`.

#### P1-09 · Dividend maths (B04, B05, B06, B07) — M · depends on: P1-06
**Files:** `backend/stock_service.py` (`get_dividend_calendar`, `get_dividend_yearly_comparison`, `get_fundamentals`, `get_portfolio_intelligence`), `backend/requirements.txt` (pin yfinance).
**Steps:** 1) `annual_income_estimate` = Σ over holdings of (trailing-12-month dividend events per share × shares). 2) Yearly comparison uses shares-at-year-end from `valuation_snapshots` (fallback `transactions`, fallback today with `estimated: true`). 3) `get_fundamentals` normalises `dividend_yield` to percent once; every consumer uses the normalised field. 4) `weighted_yield_on_cost` denominator = cost of income-contributing holdings; manual holdings carry `annual_income: null`. 5) `_estimate_payment_date` results labelled `estimated: true`.
**Acceptance:** four tests, one per bug.
**Verify:** `pytest -q backend/tests/test_dividends.py`.

#### P1-10 · Fidelity parser fixes (B08, B09, B10) — S · depends on: P1-02
**Files:** `backend/fidelity_csv.py`.
**Steps:** per §5 rows B08–B10; also let `_is_valid_ticker` accept `BRK.B`-style dotted symbols and strip `**` from `SPAXX**` (treat as money market, skip). Flip the three `xfail`s to plain tests.
**Acceptance:** `edge.csv` imports the TOTAL fund, keeps the negative sign, finds the header after the preamble.
**Verify:** `pytest -q backend/tests/test_fidelity_csv.py` → 0 xfailed.

#### P1-11 · Import transaction + previous_close (B11) — S · depends on: P1-06, P1-10
**Files:** `backend/main.py:import_fidelity_csv`.
**Steps:** 1) One `get_db()` connection, one `commit()` at the end, `rollback()` on any row failure (all-or-nothing; report the failing row). 2) On update, `previous_close = entry.current_price`. 3) Write `transactions(source=import_diff)` for every share delta. 4) Honour `account_id` from the request (the frontend never sends it today — P2-04 fixes the client).
**Acceptance:** B11 tests.
**Verify:** `pytest -q backend/tests/test_import_route.py`.

#### P1-12 · Batch quotes, parallel fundamentals, quote cache (B15) — M · depends on: P1-01
**Files:** `backend/stock_service.py`.
**Steps:** 1) `_fetch_prices_sync`: one `yf.Tickers(" ".join(tickers))` call, read `fast_info` per ticker from the batch object; fall back per ticker only on failure. 2) `_quote_cache = {ticker: (ts, data)}` with a 900 s TTL used by `validate_ticker` and `refresh_all_prices`. 3) `get_portfolio_intelligence`/`get_portfolio_analytics`: `await asyncio.gather(*[get_fundamentals(t) for t in tickers])` behind an `asyncio.Semaphore(4)`. 4) `refresh_all_prices` history refresh: `asyncio.gather` with the same semaphore. 5) Bound the module-level caches (`_fundamentals_cache` etc.) to 500 entries (drop oldest).
**Acceptance:** a mocked `yf.Tickers` is called once for 20 tickers; analytics with 20 mocked tickers completes < 1 s.
**Verify:** `pytest -q backend/tests/test_market_data.py`.

#### P1-13 · Small correctness fixes (B16, B17) — S · depends on: P1-01
**Files:** `backend/main.py`, `backend/stock_service.py`.
**Steps:** per §5 rows B16/B17. Technicals `"price"` comes from `holdings.current_price` when present; support/resistance returns only real pivots, nearest-to-price first, `count` may be < 3; `dismiss_alert` 404s; `update_holding` uses a boolean flag instead of `"datetime_now"`; `_get_default_account_id` no longer commits; `get_price_history` rejects unknown periods with 400 and supports `max`.
**Acceptance:** one test each.
**Verify:** `pytest -q backend/tests/test_misc.py`.

#### P1-14 · New endpoints for the new shell — M · depends on: P1-06, P1-08
**Files:** `backend/main.py`, `backend/stock_service.py`, `frontend/src/hooks/useApi.js`.
**Steps:** 1) `GET /api/search?q=` → up to 8 `{symbol, name, type, price, exchange}` from `yfinance.Search(q)` (or the `query2.finance.yahoo.com/v1/finance/search` endpoint via `urllib` if `Search` is unavailable in the pinned version), cached 1 h per query, manual/proxy instruments from `instruments` merged in. 2) `GET /api/accounts/{id}/summary` → value, day change, cost basis, positions count, last import, cash. 3) `GET /api/holdings/{id}/detail` → holding + instrument + last 90 snapshot prices + transactions + dividend info (one call for the detail screen). 4) `GET /api/net-worth/history` is P1-08. 5) All added to `useApi.js` with JSDoc like the existing entries.
**Acceptance:** route tests with mocked yfinance; `useApi.js` has the methods.
**Verify:** `pytest -q backend/tests/test_new_endpoints.py`.

### Phase 2 — Import & Add

#### P2-01 · Importer core — M · depends on: P1-11
**Files:** `backend/importers/__init__.py`, `base.py`, `detect.py`.
**Steps:** 1) `CanonicalRow = {symbol|None, name, quantity, price, value, cost_basis|None, raw_line_no}`. 2) `Preset = {id, label, header_signature: list[str], column_map: dict, skip_rules, money_parser}`. 3) `detect_preset(header_cells) → preset|None` by signature subset match. 4) `parse(text, preset_or_column_map) → {rows, skipped: [{line, reason}]}` using `csv` with the header-finding rule from P1-10 and `_parse_money` from the fixed Fidelity module. 5) Paste support: tab-separated and multi-space-separated tables are normalised to CSV before parsing.
**Acceptance:** unit tests with the Fidelity fixtures via the new API give identical rows to `fidelity_csv.parse_fidelity_csv`.
**Verify:** `pytest -q backend/tests/test_importers.py`.

#### P2-02 · Presets — M · depends on: P2-01
**Files:** `backend/importers/fidelity.py` (move + adapt `fidelity_csv.py`; keep `CATEGORY_MAP`, `BENCHMARK_MAP`), `robinhood.py`, `schwab.py`, `coinbase.py`, `generic.py`; fixtures for each.
**Steps:** one fixture per preset built from the institution's public export format (positions/holdings export, not transactions, except Coinbase which only exports transactions — aggregate buys/sells to a position per asset). Generic = column mapper: the client sends `column_map` explicitly. Store the chosen map in `import_profiles` per account.
**Acceptance:** each fixture parses to the expected rows; unknown headers fall to Generic with `needs_mapping: true` and the first 5 raw rows.
**Verify:** `pytest -q backend/tests/test_importers.py`.
**Notes:** the owner will confirm the actual brokerage/exchange; get Fidelity + that one right first, the others can be best-effort with a `best_effort: true` flag.

#### P2-03 · Preview diff and commit — M · depends on: P2-02, P1-06
**Files:** `backend/importers/diff.py`, `backend/main.py` (`POST /api/import/preview`, `POST /api/import/commit`; the old `/api/import/fidelity-csv` becomes a thin alias then is removed in P4-04).
**Steps:** 1) `preview(rows, account_id)` → items of kind `new|changed|removed|unchanged|skipped`; match by symbol, else by normalised name (uppercase, letters only) for ticker-less funds; `changed` when `|Δshares| ≥ 0.0005`; `removed` = current position absent from the statement. 2) `commit(items, account_id, include_ids)` in one transaction: update/insert/delete holdings, insert `instruments` if unknown (`proxy` when no symbol, benchmark from `BENCHMARK_MAP`), write `transactions(source=import_diff)` per applied item, set `accounts.last_import`, store `import_profiles`. 3) Preview is pure (no writes) and returns a `preview_token` (hash of items) that commit must echo, so a stale preview can't be applied.
**Acceptance:** the sample flow from the demo reproduces: 1 new / 3 changed / 1 removed / 2 skipped; commit is atomic; re-running the same statement yields all `unchanged`.
**Verify:** `pytest -q backend/tests/test_import_diff.py`.

#### P2-04 · Client API methods — S · depends on: P2-03, P1-14
**Files:** `frontend/src/hooks/useApi.js`.
**Steps:** `search(q)`, `importPreview({account_id, text|file, column_map?})` (multipart when a file), `importCommit({account_id, preview_token, include})`, `getAccountSummary(id)`, `getHoldingDetail(id)`, `getNetWorthHistory(range, accountId)`, `listTransactions(params)`. Route the multipart call through a shared helper so 401 handling matches `apiFetch`.
**Verify:** `npx eslint frontend/src/hooks/useApi.js`; `npm run build`.

#### P2-05 · AddSheet — four-tap add — M · depends on: P2-04, P3-01
**Files:** `frontend/src/screens/AddPosition.jsx` (route `/add`), replaces the add form in `ManageHoldings.jsx`.
**Steps:** exactly the demo: search (debounced 250 ms, results show name + EOD price + type badge) → quantity (`inputmode="decimal"`, live `≈ $value at $price`) → cost (optional, placeholder = price) → account (chips; crypto instruments only offer crypto accounts) → Save → `POST /api/holdings` → toast → navigate `/holdings?new=<id>` (row flashes). "Not listed? Add an unpriced asset" path: name, value, type, account → `is_manual=1`, `current_price=value`, `shares=1`. Progress bar of 4 segments; a top-right ✕ cancels.
**Acceptance:** Playwright: add `VTI` ×3 to the brokerage account ends on Holdings with the new row highlighted; no field is duplicated for desktop vs mobile (one component, responsive).
**Verify:** `npm run build`; `node scripts/e2e.js add` (P3-04 adds the script).

#### P2-06 · ImportFlow — M · depends on: P2-04, P3-01
**Files:** `frontend/src/screens/ImportStatement.jsx` (route `/import`).
**Steps:** step 1 account chooser (preset remembered shown) + Upload CSV (`<input type=file accept=.csv,.txt>`) or paste `<textarea>`; step 2 detected preset + column mapping list (tap a row → picker of header columns; shows first 3 parsed rows); step 3 diff list with kind pills, per-row include toggle, counts; sticky "Apply N changes to <account>" → commit → toast → `/accounts/:id`. Errors from the API render inline under the step, never `alert()`.
**Acceptance:** Playwright runs the Fidelity `edge.csv` through all three steps.
**Verify:** `npm run build`; `node scripts/e2e.js import`.

#### P2-07 · Remove duplicate import/add entry points — S · depends on: P2-05, P2-06
**Files:** `frontend/src/components/Settings.jsx` (Data tab CSV block), `frontend/src/components/ManageHoldings.jsx` (delete the component once Holdings/Account screens cover edit + delete — P3-05/P3-07), `Dashboard.jsx` "Manage" button.
**Acceptance:** exactly one path to add and one to import, both from the `+` slot (and the Import button on Account detail).

### Phase 3 — New shell (strangler)

#### P3-01 · Tokens + primitives — M · depends on: —
**Files:** `frontend/src/styles/tokens.css` (imported once in `main.jsx`), `frontend/src/ui/*.jsx` per §3.3, `frontend/index.html` (drop the duplicate body safe-area padding; keep `viewport-fit=cover`).
**Steps:** 1) CSS variables from §2; `theme.js` re-exports the same values so old components keep working. 2) Each primitive ≤ 120 lines, props documented with JSDoc, no business logic. 3) `SegmentedControl` renders `role="tablist"`; `Sheet` traps focus, locks body scroll, closes on backdrop/Escape/drag > 100 px, respects reduced motion; `Toast` is a provider at the app root with `useToast()`; inputs are 16 px minimum. 4) `lucide-react` added to `package.json`.
**Acceptance:** a storybook-free demo route `/dev/ui` (only in `import.meta.env.DEV`) renders every primitive; lint clean.
**Verify:** `npx eslint frontend/src/ui`; `npm run build`.

#### P3-02 · URL-routed shell with lazy routes — M · depends on: P3-01
**Files:** `frontend/src/App.jsx`, `frontend/src/components/BottomTabBar.jsx` (rewritten on primitives), `frontend/src/screens/` (new directory).
**Steps:** 1) Routes per §3.1 with `React.lazy` + `Suspense` (skeleton fallback). 2) Existing `Dashboard.jsx` mounted at `/legacy/*` unchanged until P4-04. 3) Tab bar: Home · Holdings · + · Insights · More; `+` opens the `Sheet` with the two choices; active state from `useLocation`. 4) Back button works (detail screens use `navigate(-1)` with a fallback to the tab root). 5) `ProtectedRoute` unchanged.
**Acceptance:** deep link to `/holdings/12` renders that screen after login; browser back returns to `/holdings`; bundle analysis (`npx vite-bundle-visualizer` or `--report`) shows Technicals/Options/Bonds are not in the initial chunk.
**Verify:** `npm run build` (inspect chunk list); Playwright navigation test.

#### P3-03 · Request cache/dedupe — S · depends on: P3-02
**Files:** `frontend/src/hooks/useQuery.js` (new, ~80 lines), `useApi.js` unchanged.
**Steps:** `useQuery(key, fetcher, {staleMs})` with an in-memory map, in-flight dedupe, `invalidate(keyPrefix)`; mutations (add/import/delete/refresh) call `invalidate('/api/holdings')`. Service-worker `API_UPDATED` messages also invalidate.
**Acceptance:** switching Home → Holdings → Home fires `/api/holdings` once within `staleMs`.
**Verify:** Playwright request counting.

#### P3-04 · Home screen — L · depends on: P3-02, P3-03, P1-08, P1-14
**Files:** `frontend/src/screens/Home.jsx`, `frontend/src/ui/ScrubChart.jsx`, `scripts/e2e.js` (Playwright smoke runner at 390×844; add here, extend in later tasks).
**Steps:** per §4. Data: `/api/holdings` (accounts + totals), `/api/net-worth/history?range=`, `/api/alerts?triggered=true`. Pull-to-refresh calls `refreshPrices()` then invalidates. Account-scope chip → `Sheet` listing All + accounts. Skeleton matches the final layout heights (hero 44 px, chart 150 px, 3 account rows). "Explain numbers" toggle wires `data-explain` captions (a `<Explain>` wrapper reading a context flag). Count-up on mount only, not on every re-render.
**Acceptance:** Playwright: hero shows full-precision currency; scrub changes and restores the hero; no horizontal scroll; every tappable ≥ 44 px (pills/chips via padded hit area); reduced-motion disables the count-up.
**Verify:** `node scripts/e2e.js home`.

#### P3-05 · Holdings screen — M · depends on: P3-04
**Files:** `frontend/src/screens/Holdings.jsx`.
**Steps:** per §4; group by account | asset class; search; sort `Sheet`; row swipe-left → Edit / Remove (Remove confirms in a `Sheet`, never `window.confirm`); `?new=<id>` flash. Edit opens a small `Sheet` (shares, avg cost, account move) → `PUT /api/holdings/:id`.
**Verify:** `node scripts/e2e.js holdings`.

#### P3-06 · Holding detail — M · depends on: P3-04, P1-14
**Files:** `frontend/src/screens/HoldingDetail.jsx`.
**Steps:** per §4 using `/api/holdings/:id/detail`; chart = snapshot prices (or `price_history` when longer); "Open in Technicals" links to `/more/tools/technicals?ticker=`; news reuses the existing `/api/news` call and component from `TechnicalsTab` only if it can be imported without the rest of that file — otherwise omit news here.
**Verify:** `node scripts/e2e.js holding`.

#### P3-07 · Account detail — M · depends on: P3-04, P1-14
**Files:** `frontend/src/screens/AccountDetail.jsx`; `AccountManager.jsx` reused under `/more/accounts` with its `window.confirm` replaced.
**Steps:** per §4; statement card (last import, preset, Import button → `/import?account=`); activity list from `/api/transactions?account_id=`.
**Verify:** `node scripts/e2e.js account`.

#### P3-08 · Toasts everywhere, no browser dialogs — S · depends on: P3-01
**Files:** every component with `setTimeout(() => setX(false), 2000)` feedback (`Settings.jsx:221,335`, `RebalancePlanner.jsx:104,108`), `AccountManager.jsx:87`, `Settings.jsx:809`.
**Steps:** replace with `useToast()` / `Sheet` confirms; `handleRefresh` in the legacy dashboard and all `.catch(() => {})` sites surface an error toast.
**Acceptance:** `grep -rn "window.confirm\|alert(" frontend/src` → no results.

#### P3-09 · One number formatter — S · depends on: —
**Files:** all `.toFixed(`/`toLocaleString(` currency sites; `Dashboard.jsx:189` and `CryptoView.jsx:36` `fmtK`.
**Steps:** use `utils/format.js` (`fmtCurrency` full precision by default; `fmtCompact` only in chart axes); shares via a new `fmtQty` (max 6 decimals, no trailing zeros).
**Acceptance:** `grep -rn "fmtK\b" frontend/src` → none; the portfolio total never renders as `$…k`.

#### P3-10 · PWA/service-worker upgrade — S · depends on: P3-02
**Files:** `frontend/public/sw.js`, `public/manifest.json`, `index.html`, `scripts/generate-icons.html`, `vite.config.js`.
**Steps:** 1) `STATIC_CACHE` derived from `__APP_COMMIT__` (inject at build via a Vite plugin that writes `sw.js` with the hash) so every deploy invalidates. 2) Precache the built `assets/*` list (same plugin). 3) `manifest.json`: add `id: "/"`, `scope: "/"`, `orientation: "portrait"`, `display_override: ["standalone"]`. 4) Replace the six `apple-touch-startup-image` SVG links with PNGs generated by `scripts/generate-icons.html` for the listed device sizes (or drop them — iOS ignores SVG). 5) SWR paths: add `/api/net-worth/history` with a 60 s max-age.
**Acceptance:** after a rebuild, an installed PWA picks up the new bundle on next launch without a manual cache bump.
**Verify:** `npm run build && ls frontend/dist && grep -c "assets/" frontend/dist/sw.js`.

#### P3-11 · iOS polish pass — S · depends on: P3-04…P3-07
**Files:** the new screens, `index.html`.
**Steps:** single safe-area strategy (root padding **or** fixed-bar padding, not both); `-webkit-overflow-scrolling: touch` on every horizontal scroller; haptics: replace `navigator.vibrate` with a no-op on iOS and the `<input type="checkbox" switch>` trick only where Safari supports it (feature-detect), otherwise nothing — never fake it; landscape check; Dynamic Type check (`font-size` in rem, layouts survive 120 %).
**Acceptance:** the §7 UI checklist passes on 375×667, 390×844, 430×932 and landscape.
**Verify:** `node scripts/e2e.js all --viewports`.

### Phase 4 — Consolidate, quarantine, delete

#### P4-01 · Insights screen — M · depends on: P3-02, P1-07, P1-08, P1-09
**Files:** `frontend/src/screens/Insights.jsx`.
**Steps:** cards (each in its own `ErrorBoundary`, lazy): Allocation donut by asset class (from `/api/rebalance-suggestions` allocation + `AssetClassBreakdown` logic), Performance vs S&P (from `/api/net-worth/history`, TWR shown), Dividends (`DividendIncomeSection`, `DividendCalendarSection` reused), Projections (`ProjectionTab` reused), Drift & rebalance (`DriftAnalysis`, `RebalancePlanner` — brokerage accounts only, per account).
**Acceptance:** every existing analytics component is reachable from Insights; none is imported by Home.

#### P4-02 · Park the tools — S · depends on: P3-02
**Files:** `frontend/src/screens/Tools.jsx`, routes `/more/tools/:tool`.
**Steps:** `React.lazy` each of `TechnicalsTab`, `OptionsTab`, `BondsTab`, `CryptoSetupScanner`, `CryptoTradeJournal`, `CryptoRiskDashboard`, `CryptoMarketContext`; pass them the same `holdings` prop shape they get today; `CryptoTradeJournal`'s localStorage entries get a one-time "Move to activity" button that posts `transactions(source=manual_edit)`.
**Acceptance:** each tool renders unchanged behind its route; not in the initial bundle.

#### P4-03 · Dissolve `CryptoView` — S · depends on: P3-07, P4-02
**Steps:** `CryptoOverview`/`CryptoPositions` content is covered by Account detail for a crypto account; delete `CryptoView.jsx` and the crypto tab arrays in `BottomTabBar.jsx`.

#### P4-04 · Delete legacy — S · depends on: P2-07, P3-05, P3-06, P3-07, P4-01, P4-02, P4-03
**Steps:** remove `/legacy/*`, `Dashboard.jsx`, `OverviewTab.jsx`, `AllocationTab.jsx` shell (its child cards live in Insights), `PerformanceTab.jsx`, `ManageHoldings.jsx`, `SwipeContainer.jsx` + `useSwipeNavigation.js`, `DividendIntelligence.jsx`, `SectorAllocation.jsx`, `useStaggeredMount.js`, `backend/seed_401k.py`, `POST /api/import/fidelity-csv` alias, `fidelity_csv.py` (moved in P2-02).
**Acceptance:** `npm run lint` reports 0 errors repo-wide; `npm run build` chunk list has no legacy names.

#### P4-05 · Rewrite `CLAUDE.md` — S · depends on: P4-04
**Steps:** update Commands (tests), Architecture (screens, `ui/`, `screens/`, importers, model), Holdings model section (per-account uniqueness, snapshots, transactions), env vars (`CORS_ORIGINS`). Point to this file for anything still open.

### Phase 5 — Later (not scheduled)

P5-01 morning-brief push at 07:00 ET (net worth, yesterday's delta, biggest mover) via the existing `pywebpush` pipeline · P5-02 alerts scoped per account in the UI · P5-03 cash / HSA / manual-asset accounts surfaced in the UI (model already supports them) · P5-04 XIRR alongside TWR once `transactions` has enough history · P5-05 run `scripts/e2e.js` in a GitHub Action · P5-06 lots/cost-basis by tax lot if the owner ever wants realised-gain reporting.

---

## 7. Definition of done

**Backend task**
- [ ] New/changed behaviour has a test in `backend/tests/`; `pytest -q` passes with no network.
- [ ] Any migration runs twice on a copied DB without error and preserves row counts and ids.
- [ ] No new `except Exception: pass`; errors are logged with context.
- [ ] Every yfinance call is inside `asyncio.to_thread` and outside per-holding loops.
- [ ] Response-shape changes to `/api/holdings` or `/api/settings` bump `STATIC_CACHE` (until P3-10 automates it).

**UI task**
- [ ] Renders at 375×667, 390×844, 430×932 and landscape with no horizontal scroll (Playwright at those viewports).
- [ ] Every tappable element ≥ 44×44 pt (padded hit area is fine; visual can be smaller).
- [ ] Safe areas: fixed bars pad by `env(safe-area-inset-*)` once; nothing hides under the tab bar.
- [ ] Colours and spacing only via tokens; numbers via `utils/format.js` with `tabular-nums`; no emoji icons; icons from `lucide-react`.
- [ ] `prefers-reduced-motion` disables count-ups, staggers and sheet slides.
- [ ] Loading state is a skeleton the same height as the content; errors are toasts or inline text, never `alert`/`confirm`.
- [ ] `npx eslint <touched files>` → 0 errors; `npm run build` succeeds.

**Release**
- [ ] `portfolio.db` backed up before deploying a migration task.
- [ ] Portainer: Stacks → portfolio → Pull and redeploy; verify `GET /api/holdings` and one snapshot row for today.

---

## 8. Status

| Task | Status | Commit | Notes |
|---|---|---|---|
| Hotfix (pre-P1): compounding fix, `valuation_snapshots`, default filter | done | `d1c518b` | verified with a temp-DB script; snapshot history accrues from deploy day |
| P1-01 | todo | | |
| P1-02 | todo | | |
| P1-03 | todo | | |
| P1-04 | todo | | |
| P1-05 | todo | | back up DB first |
| P1-06 | todo | | |
| P1-07 | todo | | bump SW cache |
| P1-08 | todo | | |
| P1-09 | todo | | |
| P1-10 | todo | | |
| P1-11 | todo | | |
| P1-12 | todo | | |
| P1-13 | todo | | |
| P1-14 | todo | | |
| P2-01 | todo | | |
| P2-02 | todo | | confirm the owner's brokerage + exchange first |
| P2-03 | todo | | |
| P2-04 | todo | | |
| P2-05 | todo | | |
| P2-06 | todo | | |
| P2-07 | todo | | |
| P3-01 | todo | | can start in parallel with Phase 1 |
| P3-02 | todo | | |
| P3-03 | todo | | |
| P3-04 | todo | | |
| P3-05 | todo | | |
| P3-06 | todo | | |
| P3-07 | todo | | |
| P3-08 | todo | | |
| P3-09 | todo | | can start any time |
| P3-10 | todo | | |
| P3-11 | todo | | |
| P4-01 | todo | | |
| P4-02 | todo | | |
| P4-03 | todo | | |
| P4-04 | todo | | |
| P4-05 | todo | | |

Suggested order for a single agent: P1-01 → P1-02 → P1-03 → P1-04 → P1-05 → P1-06 → P1-07 → P1-08 → P1-09 → P1-10 → P1-11 → P1-12 → P1-13 → P1-14 → P3-01 → P3-02 → P3-03 → P2-01 → P2-02 → P2-03 → P2-04 → P3-04 → P3-05 → P3-06 → P3-07 → P2-05 → P2-06 → P3-08 → P3-09 → P2-07 → P3-10 → P3-11 → P4-01 → P4-02 → P4-03 → P4-04 → P4-05. Two agents: one takes Phase 1 top-to-bottom, the other P3-01/P3-02/P3-03/P3-09 and then waits for P1-08/P1-14.
