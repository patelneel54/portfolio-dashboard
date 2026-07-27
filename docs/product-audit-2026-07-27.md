# Portfolio Dashboard — Comprehensive Product Audit

**Date:** 2026-07-27
**Scope:** Full application — backend architecture, frontend UI/UX, PWA capabilities, self-hosted deployment, feature completeness, accessibility, and competitive positioning.
**Method:** Static review of `backend/` (main.py, database.py, auth.py, stock_service.py, webauthn_routes.py, fidelity_csv.py), `frontend/src/` (40 components, hooks, theme/shared styles), `frontend/public/` (service worker, manifest), Docker/Compose config, and prior audit docs (`docs/allocation-review-2026-04-12.md`, `docs/beta-review-settings-2026-04-11.md`) to avoid re-flagging fixed issues.
**Note on scope of this pass:** this is a research/strategy audit, not a bug-fix pass — no code was changed. Findings below are prioritized recommendations for a future implementation pass, not fixes already applied.

---

## 1. Executive Summary

This app has grown far past its original plan (`PLAN.md`'s 8-component MVP) into a genuinely sophisticated personal finance system: three account types, a full crypto sub-app, options P&L simulation, bond metrics, dividend intelligence, rebalancing suggestions, WebAuthn passkeys, and a real PWA with push notifications and offline reads. The engineering discipline is notably high for a solo self-hosted project — parameterized SQL throughout, consistent design tokens, `asyncio.to_thread` wrapping for every blocking yfinance call, and zero TODO/stub markers anywhere in the codebase.

The gap between "impressive feature surface" and "production-grade" is concentrated in three places:

1. **Security posture assumes a trusted network that the deployment docs actively encourage exposing.** The default JWT secret is a literal string in the repo, `require_auth` fully disables itself with no PIN configured, and `README.md` walks users through deploying with `AUTH_PIN_HASH` blank "for now." Combined with `docker-compose.yml` publishing `8000:8000` on all interfaces, a follow-the-README deploy is unauthenticated on the network until a second manual step.
2. **The offline/PWA story is read-only.** SWR caching, precached shell, and safe-area handling are genuinely well done, but there is zero offline mutation queue and zero Background Sync — a `sw.js` and manifest built for "installable app" without the one behavior (working while the NAS is unreachable, e.g. commuting) that would make offline meaningful for a phone-installed dashboard.
3. **A few silent-failure patterns undermine trust in the numbers.** The migration system swallows *all* exceptions, not just "already applied." Per-ticker refresh failures are swallowed with no logging. The service-worker's stale-while-revalidate cache has no TTL, so a network-unreachable phone can show week-old prices as if live, with no visible staleness cutoff beyond a timestamp nobody is required to look at.

None of this is a rewrite — it's a focused hardening pass (auth defaults, a few `try/except` scopes, a cache TTL, one offline queue) plus a handful of high-leverage feature additions (net worth history, realized gains, tax-lot tracking) that would move this from "excellent personal project" to "the app I trust over Empower."

**Overall maturity: B+ engineering, B- production-readiness.** The two are diverging as features accumulate faster than hardening.

---

## 2. Top 10 Highest-Impact Improvements

| # | Title | Category | Priority | Complexity | Value |
|---|---|---|---|---|---|
| 1 | Fail closed, not open, when `JWT_SECRET`/`AUTH_PIN_HASH` are unset or default | Security | **Critical** | Small | High |
| 2 | Add a cache-staleness TTL + visible "data may be stale" cutoff to the service worker | PWA | High | Small | High |
| 3 | Wrap `daily_refresh_and_check` and `init_db` migrations in real error handling + logging | Architecture | High | Small | High |
| 4 | Fix `AlertManager` delete-with-no-confirmation (destructive action pattern break) | UX | High | Small | High |
| 5 | Fix `C.textDim` failing WCAG AA contrast across 35 files | Accessibility | High | Small | High |
| 6 | Add `/health` endpoint + Docker healthcheck + basic logging/rotation | Architecture | High | Small | Medium |
| 7 | Add offline mutation queue (IndexedDB + Background Sync) for add-holding/add-alert | PWA | Medium | Large | High |
| 8 | Track realized gains and per-lot cost basis (schema already has `purchase_date`) | Feature | Medium | Medium | High |
| 9 | Add net worth history table + chart (point-in-time snapshots, not current-shares-backfilled) | Feature | Medium | Medium | High |
| 10 | Add manifest `shortcuts` + `screenshots` for a richer install prompt | PWA | Nice-to-Have | Small | Medium |

---

## 3. UI Findings

| Finding | File:Line | Issue | Severity |
|---|---|---|---|
| Broken color token | `Settings.jsx:638` | Export dropdown uses `C.bgCard`, which doesn't exist in `theme.js` (only `C.card`) — renders with browser-default white background against near-white text; likely unreadable | **High** |
| Contrast failure | `theme.js:10` (`textDim #5A5A6E`) | ~2.9:1 contrast on dark background, fails WCAG AA (4.5:1); used in 35 files including disclaimers, table headers, empty states | **High** (also §7 Accessibility) |
| Inconsistent border radius | `Dashboard.jsx:235,238,241` | `buttonSecondary` radius overridden to `6` vs. `8–10` elsewhere | Low |
| Style duplication | `OverviewTab.jsx:30` | Hand-rolled card style instead of shared `cardStyle` token | Low |
| Loading state gaps | `Settings.jsx:382-388`, `AccountManager.jsx:145-147` | Plain "Loading…" text, no skeleton, inconsistent with Dashboard's polish | Low |
| Blank-flash loading | `AlertManager.jsx:68` | `if (loading) return null` — no skeleton/spinner at all | Medium |
| No mobile layout | `AlertManager.jsx`, `AccountManager.jsx` | No `useMediaQuery` dual-render, unlike ManageHoldings/AllocationTab's sheet-vs-modal pattern | Medium |

**Why it matters:** the app has a real design system (`theme.js` + `shared.js`) and most components honor it — these are the exceptions, and exceptions in a finance app (unreadable text, invisible dropdowns) erode trust fast. The fixes are all small and mechanical.

---

## 4. UX Findings

| Finding | File:Line | Issue | Severity |
|---|---|---|---|
| Missing delete confirmation | `AlertManager.jsx:60-63` | `handleDelete` fires immediately with zero confirmation, while `ManageHoldings.jsx:285-304` and `AccountManager.jsx:87` both confirm — a direct pattern break on a destructive action | **High** |
| No focus trap on popover | `BottomTabBar.jsx:141-188` | "More" popover has no focus trap or Escape handler, unlike modals elsewhere which use `useFocusTrap` | Medium |
| Bottom nav on desktop | `Dashboard.jsx:373` | `BottomTabBar` renders unconditionally at all widths — a mobile pattern applied to desktop pointer users with no alternative top nav | Medium |
| No numeric input guard | `ManageHoldings.jsx:83-113` | `parseFloat(shares)` sent even if NaN; validation is HTML `required` only, backend does the real rejection | Medium |
| No persisted view state | `Dashboard.jsx:57,65`, `AllocationTab.jsx:46` | `accountFilter`, sort key, and tab selection all reset on remount — a daily user re-filters every session | Nice-to-Have |
| No global search | — | Search exists only inside ManageHoldings and AllocationTab's own lists, not cross-app | Nice-to-Have |
| No keyboard shortcuts | — | Zero shortcuts anywhere; a daily-use dashboard (comparable to Linear/Notion) would benefit from `⌘K`/tab-number jumps | Future Enhancement |

**Recommended workflow simplification:** persist `accountFilter` + last-active tab to `localStorage` (same mechanism already used for the JWT and crypto watchlist) — this alone removes a repeated click on every single app open for a daily user.

---

## 5. PWA Findings

| Finding | File:Line | Issue | Severity |
|---|---|---|---|
| Unbounded cache staleness | `sw.js:57-99` | SWR cache for holdings/settings has no TTL — offline/unreachable phone shows arbitrarily old prices as current, with only a background timestamp, no enforced cutoff | **High** for a finance app |
| No offline mutation queue | grep confirmed zero matches for IndexedDB/Background Sync | Add-holding, add-alert, refresh-prices all hard-fail offline with no queue/retry | **High** (paired with #6 below) |
| No Background Sync | grep confirmed zero matches | No client-initiated `sync.register()` for offline writes or periodic refresh | High |
| Dead cache-fallback code | `sw.js:102-108` | Non-SWR `/api/*` requests are never `cache.put` on success, so the catch-block `caches.match` fallback always misses | Medium |
| No cache-busting on deploy | `sw.js:1-3` | Three cache names bumped manually; a deploy that changes JS/CSS without bumping `STATIC_CACHE` silently serves stale bundles | Medium |
| Missing manifest richness | `manifest.json` | No `shortcuts`, `screenshots`, `id`, or `lang`; `splash.svg` exists but isn't wired via manifest screenshots | Medium |
| No subscription-rotation handling | `pushNotifications.js:43-81`, `sw.js` | No `pushsubscriptionchange` handler — a rotated browser subscription leaves a dead endpoint server-side until the next failed push | Medium |
| No Badge API | — | `navigator.setAppBadge` unused — triggered-alert count doesn't surface on the home-screen icon | Nice-to-Have |

**What's genuinely strong:** SWR implementation itself, pull-to-refresh, full safe-area-inset coverage across 8+ components, and a complete push flow including a test-send endpoint — this is more PWA investment than most self-hosted dashboards attempt.

---

## 6. Self-Hosted Architecture Findings

| Finding | File:Line | Issue | Severity |
|---|---|---|---|
| Forgeable JWT by default | `auth.py:21` | `JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")` — unset env var silently ships a public, guessable secret; nothing enforces it being changed | **Critical** |
| Auth fully disabled when unset | `auth.py:119-123` + `README.md` deploy steps | `require_auth` no-ops with no PIN configured; the README explicitly instructs deploying with `AUTH_PIN_HASH` blank "for now" while exposed on `8000:8000` to the LAN | **Critical** |
| No HTTPS story | `docker-compose.yml:7-8,14` | JWT/PIN travel in plaintext unless the user fronts it with TLS themselves; no reverse-proxy guidance in `.env.example` | High |
| Rate limiter broken behind proxy | `auth.py:143-159` | Keys on `request.client.host`; behind any reverse proxy all clients share one IP with no `X-Forwarded-For`/`TrustedHost` handling | Medium |
| No security headers | `main.py:160-169` | No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy anywhere | Medium |
| CORS hardcoded to dev origins | `main.py:164-166` | `allow_origins=["localhost:5173","localhost:3000"]` with `allow_credentials=True` shipped unconditionally in the production image | Low |
| Migrations swallow all errors | `database.py:130-134` | Bare `except Exception: pass` masks real failures (disk full, lock, syntax error), not just "already applied"; no schema-version table to detect drift | High |
| Scheduler has no error handling | `main.py:135-138` | `daily_refresh_and_check` unwrapped — if `refresh_all_prices()` throws, `check_alerts()` never runs and nothing logs it until the next day's silence | High |
| Silent per-ticker refresh failures | `stock_service.py:118-129` | yfinance failures are `continue`d with no logging — stale prices persist indefinitely with no visibility into which ticker failed | Medium |
| No `/health` endpoint, no Docker healthcheck | `docker-compose.yml`, `main.py` | Nothing to point Portainer/reverse-proxy health checks at | Medium |
| No backup/restore story | `docker-compose.yml:9-10,20-21` | SQLite in a named volume with no backup script, no `sqlite3 .backup` cron, no documented restore procedure | Medium |
| No logging setup | across `main.py`/`stock_service.py` | No file handler, rotation, or structured logging — failures are largely invisible for self-hosted debugging | Medium |
| Undocumented env surface | `.env.example` | Missing `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `VAPID_PUBLIC_KEY/PRIVATE_KEY`, `DATABASE_PATH` despite being read in code | Medium |
| CSV import not transactional | `main.py:991-1039` | Opens a new DB connection and commits per-row instead of one transaction — no atomicity, N+1 connection overhead | Medium |
| No bounds on holdings fields | `main.py:179-205` | No `Field(gt=0)` on `shares`/`avg_cost` — negative values can be stored and corrupt totals | Medium |
| No upload size limit | `main.py:962-967` | Fidelity CSV upload reads entire file into memory with no size cap | Low |
| Dockerfile unpinned, no HEALTHCHECK | `Dockerfile:2,11` | Base images not pinned to digest; otherwise solid (multi-stage, non-root `appuser`, `--no-cache-dir`) | Low |

**Recommended first pass (small, high-value):** (1) refuse to boot — or loudly warn on every request — if `JWT_SECRET` is the default string; (2) require an explicit `AUTH_DISABLED=true` opt-in rather than "no PIN configured" being the implicit disable path; (3) add `/health` + Compose healthcheck; (4) wrap the scheduler job and migrations in real logging.

---

## 7. Performance Findings

Not independently profiled this pass (no dev server run), but derivable from the architecture review:

| Finding | Basis | Estimated Impact |
|---|---|---|
| CSV import per-row commits | `main.py:991-1039` | Slows large 401k imports linearly with row count; low user-visible impact (infrequent action) but risks partial-import corruption on crash |
| No pagination on `/api/holdings` / `/api/price-history` | Architecture review | Fine at personal-portfolio scale (tens of holdings); would degrade if price-history queries grow unbounded over years |
| Blocking calls correctly isolated | `stock_service.py` — every yfinance call wrapped in `asyncio.to_thread` | Existing strength — event loop isn't blocked during refresh |
| Dashboard tabs are lazy-loaded | `CLAUDE.md` architecture notes, confirmed via component list | Existing strength — avoids shipping Options/Bonds/Crypto JS on first paint |
| No image optimization concerns | manifest icons are pre-sized PNG/SVG | Non-issue at current scale |

**Recommendation:** this is not currently a performance-bound app — the highest-leverage "performance" work is actually the reliability fixes above (silent failures, unbounded cache) rather than raw speed.

---

## 8. Accessibility Findings

| Finding | File:Line | Issue | Severity |
|---|---|---|---|
| Contrast failure | `theme.js:10` | `textDim` (#5A5A6E) ~2.9:1 vs. WCAG AA 4.5:1 minimum, used in 35 files | **High** |
| Missing focus trap | `BottomTabBar.jsx:141-188` | "More" popover has no focus trap or Escape handling | Medium |
| Small touch target | `AlertManager.jsx:154-164` | Delete button `minHeight:36` vs. the app's disciplined 44px standard everywhere else | Low |
| No zero-alerts empty state | `AlertManager.jsx` | Section is silently omitted rather than showing an empty state, inconsistent with the rest of the app's empty-state coverage | Low |

**What's genuinely strong:** 44px touch targets almost everywhere, safe-area-inset handling, `aria-expanded`/`aria-controls` on disclosures (per prior audit fixes), keyboard-reachable hover overlays (per prior audit fixes), reduced-motion support. This app already cleared a real accessibility bar in the last two review passes — the remaining gaps are narrow and mechanical.

---

## 9. Feature Recommendations

### Gaps vs. best-in-class portfolio apps (Empower/Kubera/Snowball)
- **No net worth history chart.** `get_portfolio_performance` (`stock_service.py:373-449`) applies *current* share counts to historical prices — a proxy, not an accurate backtest, and silently wrong for anyone who's traded rather than just held. A `holdings_snapshots` table + nightly snapshot job would fix both this and the "drift-history sparkline" gap flagged in the prior allocation review.
- **No realized-gains tracking.** Only unrealized `gain_loss`/`gain_loss_pct` exist; no realized P&L on sells.
- **No per-lot cost basis**, despite the schema already carrying `purchase_date` (`database.py:18`) — tax-lot detail (and eventually tax-loss-harvesting suggestions) needs this.
- **No multi-currency support.**
- **No general watchlist** for non-owned tickers outside crypto (`CryptoSetupScanner.jsx` has one; stocks/ETFs don't).
- **Import is Fidelity-401k-only** (`fidelity_csv.py`). No Schwab, Robinhood, generic-CSV, or Plaid/bank-link import — everything else is manual entry.

### Half-finished functionality worth closing out
- `CryptoSetupScanner.jsx:8-32` — crypto watchlist lives only in `localStorage`, won't sync across devices, unlike everything else which is DB-backed.
- Portfolio performance chart's current-shares-backfill issue above.

### Automation opportunities
- Auto-notify on rebalance drift (the math already exists in `get_rebalance_suggestions`, `stock_service.py:1806` — it just isn't wired into the alert/push pipeline).
- Auto-reconcile dividend calendar against actually-received dividends.
- Recurring-contribution (DCA) log tied to Projection tab assumptions.
- Crypto macro context (Fed rate, CPI, DXY) is 100% manual text entry (`CryptoMarketContext.jsx:242-259`) — pull from FRED instead.
- Tax-loss-harvesting suggestions, once per-lot data exists.

---

## 10. Innovation Ideas

1. **Point-in-time net worth ledger** — nightly snapshot job writing to a `holdings_snapshots` table, unlocking an accurate net worth history chart, accurate benchmark comparison, and the drift-history sparkline flagged in the prior audit — one schema change, three features.
2. **"What changed today" digest push** — instead of only threshold alerts, a daily digest notification (biggest mover, dividend paid, drift crossed a band) sent once at market close, riding the existing push infrastructure.
3. **Offline-first mutation queue** — IndexedDB outbox + Background Sync for add-holding/add-alert, so the "installable app" story is true even on the subway.
4. **Home-screen shortcuts** via manifest `shortcuts` — long-press → "Add Holding," "View Alerts," "Refresh Prices" — near-zero implementation cost, immediate native feel.
5. **Rebalance-drift push integration** — wire `get_rebalance_suggestions` into the existing alert/push pipeline so a drifted portfolio proactively notifies instead of requiring a manual Allocation-tab check.
6. **Tax-lot + realized-gains view** — since `purchase_date` already exists per-row, add a lot-selection UI (FIFO/specific-lot) on sell and a realized-gains tab, unlocking eventual tax-loss-harvesting suggestions.
7. **Command palette (⌘K)** — jump to any tab/holding/alert instantly, in the spirit of Linear/Notion; pairs well with adding cross-app search.
8. **Badge API for triggered alerts** — `navigator.setAppBadge(count)` so the home-screen icon shows unread alert count without opening the app.
9. **Broader CSV import** — generic-CSV mapping UI (choose your own columns) would cover Schwab/Robinhood/etc. without building a parser per broker.
10. **"Data as of" staleness indicator with enforced cutoff** — surface the SWR cache timestamp prominently in the header (not just internally) and gray out/badge prices past a configurable staleness threshold (e.g. 24h), turning the current invisible risk into an honest, visible signal.

---

## 11. Prioritized Recommendation Summary

| Priority | Count | Examples |
|---|---|---|
| **Critical** | 2 | Default JWT secret, auth-disabled-by-default deploy path |
| **High** | 9 | Cache TTL, migration error swallowing, scheduler error handling, `AlertManager` delete confirmation, contrast failure, `Settings.jsx` broken color token, offline mutation queue, Background Sync, unbounded cache staleness |
| **Medium** | ~20 | See full tables above (§3–§6) — mostly deployment hardening, mobile-layout gaps, PWA manifest completeness |
| **Low** | ~10 | Style consistency nits, minor touch-target sizing, dead code paths |
| **Nice-to-Have / Future** | ~10 | Command palette, Badge API, saved views, keyboard shortcuts, broader import |

**Suggested next pass:** a narrow, single-PR security-hardening sweep (Critical + the auth/scheduler/migration High items) followed by a separate PWA-offline pass (queue + Background Sync) — mirroring the scoped, single-screen style of the two prior review docs rather than attempting all of this at once.
