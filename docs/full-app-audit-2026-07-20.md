# Portfolio Dashboard — Comprehensive Product Audit

**Date:** 2026-07-20
**Reviewer:** Automated PM / UX / Architecture pass across the whole application (backend, all frontend tabs, PWA layer, self-hosted deployment).
**Scope note:** Code-grounded, not runtime-measured — no Lighthouse/axe run, no load test. Citations are `file:line` against `master` @ HEAD (last commit `01f9c69`, 2026-04-12).
**Prior context:** Two scoped reviews already landed and fixed real defects — `docs/beta-review-settings-2026-04-11.md` (Settings/auth/push/CSV import, 10 fixes) and `docs/allocation-review-2026-04-12.md` (Allocation tab + children, 10 fixes). Both sets of fixes were spot-checked as still present in current code and are **not** re-reported here. This pass covers everywhere those two didn't: the rest of the backend, the rest of the frontend tabs, the crypto sub-app, dividends, navigation chrome, and the PWA/deployment layer.

---

## 1. Executive Summary

The app has grown, in four months, from a personal stock tracker into a genuinely broad personal-finance command center: brokerage/401k/crypto holdings, technicals, options P&L simulation, bond analytics, dividend intelligence, rebalancing, push alerts, and passkey auth. The two prior reviews already caught and fixed the scariest bugs in Settings and Allocation. This pass looked everywhere else and found the app is **functionally solid but has three classes of unresolved risk**:

1. **Security/deployment gaps that undercut the app's own auth story.** `JWT_SECRET` defaults to a public placeholder with no fail-fast, and the documented NAS deployment path is plain HTTP — which silently disables WebAuthn/passkey login (a secure-context requirement) even though the app markets passkeys as a login method. There's no health check, no backup/restore story for the single SQLite file holding someone's entire portfolio, and failures are swallowed by blanket `except Exception: pass` with no logging.
2. **A structural crack in the account model.** `AccountManager` lets users create IRA/Roth IRA/HSA accounts, but `ManageHoldings`'s tab picker only recognizes brokerage/401k/crypto — those accounts are creatable and then permanently orphaned. Separately, the entire crypto "intelligence" toolset (trade journal, risk dashboard, setup scanner, macro notes) lives only in `localStorage`, outside the DB, the backup story, and the "Reset All Data" flow — a real durability gap for what the UI frames as a durable record.
3. **Consistency debt from feature velocity outpacing shared infrastructure.** Number formatting, loading skeletons, empty states, and ARIA tab semantics were each solved once (in Settings or Allocation) and didn't propagate to the six other tabs built afterward. This is normal for a fast-moving solo project but is now the single biggest source of small UI/accessibility findings below.

None of this is an emergency — it's a single-user, LAN-hosted app — but items in §2 are worth a focused pass before this is trusted with more money or more devices.

---

## 2. Top 10 Highest-Impact Improvements

| # | Title | Type | Priority | Complexity | Value |
|---|---|---|---|---|---|
| 1 | Fail-fast on default `JWT_SECRET` | Security | **Critical** | Small | High |
| 2 | Document/require TLS for the NAS deployment (WebAuthn is silently broken without it) | Security/Architecture | **Critical** | Medium | High |
| 3 | Fix orphaned IRA/Roth/HSA accounts in `ManageHoldings` | Correctness/UX | **Critical** | Small–Medium | High |
| 4 | Add `/api/health` + Docker `HEALTHCHECK` | Architecture | High | Small | High |
| 5 | Define a backup/restore story for the SQLite volume (and include crypto localStorage state) | Architecture | High | Medium | High |
| 6 | Parallelize sequential `get_fundamentals()` loops (20–40s page loads today) | Performance | High | Small | High |
| 7 | Migrate crypto journal/risk/scanner tools from `localStorage` into the DB | Architecture/Feature | High | Large | High |
| 8 | Add confirmation to alert deletion; give `AccountManager` an in-place reassign path | UX | High | Small | Medium–High |
| 9 | Replace blanket `except Exception: pass` in migrations/yfinance calls with real logging | Architecture | High | Medium | High |
| 10 | Standardize ARIA tab semantics across the 4+ duplicated sub-tab bars | Accessibility | High | Small–Medium | Medium |

Honorable mentions that just missed the top 10: unauthenticated `/docs`/`/redoc`/`/openapi.json`, no code-splitting despite CLAUDE.md describing tabs as lazy, iOS `apple-touch-startup-image` pointing at an SVG (iOS ignores it — blank launch flash), and no confirmation/backup gate on the irreversible `DELETE /api/data/reset`.

---

## 3. UI Findings

### Visual consistency & design system
- **Medium** — Currency/percent formatting is reimplemented ad hoc per tab instead of routed through `utils/format.js`: `Dashboard.jsx:189` (`fmtK`), `ProjectionTab.jsx:41` (`fmtVal`), `PortfolioPerformanceChart.jsx:316` (k-only ticks, no M-scale), `StockDeepDive.jsx:17`, raw `toFixed` in `OptionsTab.jsx`. A compact-scale formatter already exists at `format.js:14` but is barely used. *Fix:* funnel every tab through the shared formatters.
- **Low/Medium** — `cardStyle`/`sectionTitle` from `shared.js` are re-declared inline in 10+ places (`OverviewTab.jsx:30-31`, `ProjectionTab.jsx:54,56`, `PortfolioAnalytics.jsx`, `SectorAllocation.jsx:51,60`) instead of imported — a future token change won't propagate to these.
- **Low** — `SectorAllocation.jsx` is dead code (no importers found — superseded by `PortfolioAnalytics`'s `SectorsSubTab`/`SectorDrillDown`). Delete it.
- **Low** — Icon language is mixed: raw emoji (`BondsTab.jsx:93-143`, `TechnicalsTab.jsx:759`), unicode glyphs (▲▼✓⚠), and inline SVG (`Dashboard.jsx:229`) with no consistent system.

### Responsiveness
- **Medium/High** — `ProjectionTab.jsx:121` milestone grid is `repeat(${milestones.length}, 1fr)` (up to 4 fixed columns) with no `auto-fit`/`minmax` — at 375px this squeezes 4 dollar cards into ~85px columns. *Fix:* `repeat(auto-fit, minmax(140px, 1fr))`, matching the pattern used elsewhere.
- **Medium** — Range-slider thumbs in `BondsTab.jsx:170-171` and `OptionsTab.jsx:296-297` are 18×18px vs. the 44px touch target the rest of the app enforces (`buttonPrimary`/`buttonSecondary` both `minHeight: 44`) — fiddly to drag precisely on a phone.
- **Low** — `Dashboard.jsx:316` stat row stays a fixed 2-column grid even on desktop (up to 1200px wide), wasting space that could show all 4 cards in one row.
- **Low** — `TechnicalsTab.jsx:680` comparison table forces horizontal scroll at 2-3 compared tickers on mobile with no scroll-shadow affordance.

### Forms
See §9 (UX friction) and the Management audit's Forms section — summarized: named IRA/Roth/HSA accounts are unreachable from the holdings form (Top 10 #3); PIN-change fields in `Settings.jsx:572-580` lack `inputMode="numeric"` (present correctly in `Login.jsx:158-159` but not mirrored); no bulk add/edit/delete anywhere; manual-ticker auto-generation (`ManageHoldings.jsx:89`) is undocumented magic with no hint text.

---

## 4. UX Findings

### Navigation
- **High** — `AccountFilterSheet.jsx` has no focus trap and no Escape handler (contrast: `ManageHoldings.jsx:186` uses `useFocusTrap`, `DividendCalendar.jsx:173-178` listens for Escape). Background stays tabbable; keyboard users can't dismiss it without touching the scrim.
- **Medium** — No persisted "last view" — `Dashboard.jsx:57,65` reset `activeTab`/`accountFilter` to static defaults every load, so a daily user re-navigates to their preferred filter each session.
- **Medium** — Technicals/Options/Bonds and the crypto Market/Scanner views are buried behind `BottomTabBar.jsx:42-58`'s "More" overflow — arguably the app's most analytically dense features are the hardest to reach.
- **Low** — No global ticker search; `SearchInput.jsx` is scoped only to the Manage Holdings list.

### Friction & confirmations
- **High** — `AlertManager.jsx:60-63,154-164` deletes an alert on a single tap with zero confirmation — inconsistent with `ManageHoldings`'s custom confirm dialog and `AccountManager`'s `window.confirm`.
- **High** — `AccountManager.jsx:177-188` disables Delete on an account with holdings but offers no inline path to reassign them — the user has to leave Settings, go to Manage Holdings, and re-point each holding one at a time.
- **Medium** — `Settings.jsx:322-325` "Reset All Data" wipes the DB but never touches the crypto `localStorage` keys (journal, positions, risk categories, scanner rules, watchlist, signal log, macro notes) — a "fresh start" leaves orphaned notes referencing deleted tickers.
- **Medium** — Push-notification opt-in fires unconditionally on first successful data load (`Dashboard.jsx:98-106,248-287`), even for a brand-new install with zero holdings configured — risks a premature "denied" that, per `Settings.jsx:527-531`, is then unrecoverable inside the app.
- **Medium** — `TechnicalsTab.jsx` is a 1331-line surface with four nested navigation layers (ticker chip → sub-tab → compare mode → expandable card → Quick Scan drawer) and the same ticker's price/score repeated in three places — cognitive overload for what should be a quick check.
- **Low** — `BondsTab` defaults to the `'learn'` sub-tab (`BondsTab.jsx:282`) rather than `'portfolio'`, so an existing bond holder lands on an education page instead of their own positions.
- **Low** — `Login.jsx:54-58` swallows biometric-enrollment failures with only `console.error` then silently navigates on — the user has no idea enrollment failed until the next biometric login just doesn't work.

### Onboarding
- **Medium** — No first-run guidance: a brand-new install with zero holdings gets empty charts across most tabs with no "add your first holding" call-to-action tying tabs together, and no walkthrough of iOS's manual "Add to Home Screen" step (which never fires `beforeinstallprompt`, unlike Android/desktop Chrome).

---

## 5. PWA Findings

- **Critical** — `offline.html` is dead code. `sw.js:111-120`'s navigation fallback tries `/index.html` first, which is always precached and always succeeds — `offline.html` can never actually be shown, so a truly offline user gets a blank/broken shell instead of the friendly fallback the app already built. *Fix:* have the React app detect fetch failures and render an in-app offline state, or restructure the fallback chain so `offline.html` is reachable.
- **High** — Stale cross-user data risk: `SWR_PATHS` caches `/api/holdings`/`/api/settings` in a shared `API_CACHE` keyed only by URL, not by identity — after a PIN reset or logout/login on the same device, the previous session's cached holdings can be served stale before revalidation. *Fix:* bust `API_CACHE` on logout.
- **High (iOS)** — All `apple-touch-startup-image` links (`index.html:17-22`) point at `splash.svg`, but iOS Safari only honors raster images for that tag — the splash screens are silently ignored and users get a blank flash on launch instead. *Fix:* rasterize to PNG at each declared resolution.
- **High** — No `beforeinstallprompt` handling anywhere — Android/desktop users get only the default mini-infobar, with no custom "Install" CTA (mirroring the existing push-prompt banner pattern would be cheap).
- **Medium** — No `pushsubscriptionchange` handler in `sw.js` — browser-driven subscription rotation silently stops notifications with no re-subscribe and no user-facing signal.
- **Medium** — Manifest icons declare `"purpose": "any maskable"` on the same edge-to-edge artwork (`manifest.json:22,28`) — Android will crop it when applying the mask. Needs a dedicated padded maskable icon and split purposes. No `screenshots` array either, which blocks Chrome's richer install UI.
- **Medium** — No code-splitting: no `manualChunks` in `vite.config.js`, no `React.lazy`/`Suspense` anywhere despite CLAUDE.md describing tabs as "lazy children" — all seven tabs and Recharts ship in one bundle.
- **Medium** — No offline detection (`navigator.onLine`) anywhere in `src` — non-SWR tabs (Performance, Technicals, Options, Bonds, Projection, Crypto) hard-fail offline with generic fetch errors and no "you're offline" messaging, despite the SW's SWR groundwork making a graceful read-only offline mode plausible.
- **Low** — Single alert `tag: 'portfolio-alert'` with `renotify: true` means a new alert replaces an unread one rather than stacking, and there's no per-category push toggle (price vs. drift vs. dividend).
- **Good, worth preserving** — Update flow is done right: `skipWaiting`/`clients.claim` plus a non-intrusive "New version available" banner (`App.jsx:27-63`) rather than a silent reload; SWR correctly serves-then-revalidates and posts `API_UPDATED`/`API_CACHED_AT` for "last synced" UI; safe-area-inset handling is consistent; push permission is correctly gesture-gated behind a button click, not requested on load.

---

## 6. Self-Hosted Architecture Findings

### Security
- **High** — `JWT_SECRET` defaults to `"dev-secret-change-me"` (`auth.py:21`) with no startup check and no `:?required` guard in `docker-compose.yml:15` — a misconfigured Portainer stack silently runs with a public, forgeable signing secret.
- **High** — The documented deployment (`README.md:17,21,53`) is plain `http://<NAS-IP>:8000` with zero TLS guidance. Besides shipping PIN/JWT/portfolio data in the clear on the LAN, **WebAuthn requires a secure context** — passkey registration/login will be silently unavailable under exactly the setup the README walks users through, and `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`/`WEBAUTHN_RP_NAME` aren't even documented in `.env.example`.
- **Medium** — FastAPI's `/docs`, `/redoc`, `/openapi.json` are enabled and unauthenticated (`main.py:160`), exposing the full API surface to anyone who can reach the port.
- **Medium** — No security headers anywhere (CSP, `X-Frame-Options`, `X-Content-Type-Options`, HSTS) — meaningful given the JWT lives in `localStorage`, so there's nothing constraining an XSS payload from exfiltrating it.
- **Low-Medium** — The login rate limiter keys on `request.client.host` (`auth.py:147-159`) with no `X-Forwarded-For` handling — behind any reverse proxy (which the TLS fix above requires), every client looks like the proxy, making the limiter either useless or a one-bad-actor DoS against everyone.
- **Low** — WebAuthn's challenge store is a single module-level dict (`webauthn_routes.py:32`) — concurrent register/auth flows can clobber each other. Registering a second passkey silently revokes the first (`webauthn_routes.py:101`) with no warning.
- **Low** — No file-size cap on the Fidelity CSV upload (`main.py:955`) — a large file is a memory-DoS vector.

### Deployment quality
- **High** — No `/health` route and no Docker `HEALTHCHECK` — Portainer can only detect a fully-crashed container, not one hung on a stuck yfinance call or DB lock.
- **High** — No documented backup/restore for the SQLite volume — for an app that is someone's actual portfolio record, there's no scheduled `.backup`/litestream/rsync guidance and no restore instructions, made worse by an irreversible one-shot `DELETE /api/data/reset` with no confirmation token or pre-wipe export.
- **Medium** — Update process rebuilds from source with no image tagging/registry — every Portainer "Pull and redeploy" is a one-way door with no rollback point if a migration goes bad.
- **Medium** — Logging is unstructured stdout only, and combined with pervasive `except Exception: pass/continue` in `stock_service.py` (e.g. `:33,53,111,128,162,481,501`), real failures (Yahoo throttling the NAS's IP, a migration silently no-op'ing) are invisible — no `logging.exception` calls found anywhere in the reviewed files.
- **Low** — No resource limits (`mem_limit`/`cpus`) in `docker-compose.yml` — a runaway computation could starve the NAS's other containers. Dockerfile itself (multi-stage, non-root user, slim base) is solid.

### Data model
- **High** — Migrations (`database.py:130-134`) wrap every `ALTER TABLE` in a blanket `try/except Exception: pass` with no schema-version table and no logging of what ran or failed — a genuinely broken migration is indistinguishable from a benign "column already exists."
- **High** — No transaction ledger or tax-lot tracking — `update_holding` mutates `shares`/`avg_cost` in place with no audit trail and no FIFO/LIFO/specific-lot cost basis, a real gap for a tool meant to inform tax decisions.
- **Medium** — `accounts.name` is globally `UNIQUE` rather than `UNIQUE(name, account_type)` — an IRA and a 401k can't both be named "Retirement."
- **Medium** — `account_type` is unconstrained `TEXT` at the DB layer on both `holdings` and `accounts` — validity is Python-only, so any path that bypasses the API (seed scripts, future code) can insert garbage values.

---

## 7. Performance Findings

- **High** — `get_portfolio_intelligence` (`stock_service.py:822-823`) and `get_portfolio_analytics` (`stock_service.py:1448-1450`) fetch per-holding fundamentals in a sequential `for` loop instead of `asyncio.gather` (the pattern already used correctly for dividends at `stock_service.py:1109-1120`). On a cache miss with 20+ holdings this can turn a page load into 20-40 seconds.
- **Medium** — Price fetches hit yfinance one ticker at a time in serial loops (`stock_service.py:108-112,115-130`) rather than batching via `yf.download()`'s multi-ticker support — slower, and looks more bot-like to Yahoo's rate limiter.
- **Medium** — No backoff/circuit-breaker around yfinance — if Yahoo throttles the NAS's IP, every fetch silently no-ops with zero alerting; the user only notices via a stale `last_refreshed` timestamp.
- **Medium** — `TechnicalsTab.jsx:940`'s `portfolioHealth` memo keys on `Object.keys(techData).join(',')`, but `techData` entries are updated *in place* — the key set doesn't change when data arrives, so **the memo can silently fail to recompute** and show stale/default health scores until some unrelated re-render forces it. This borders on a correctness bug, not just a performance one.
- **Medium** — `PerformanceReturnsSection.jsx:19` and `PortfolioAnalytics.jsx:446` both independently call `getPortfolioAnalytics(accountFilter)` with no shared cache — visiting Overview then Performance double-fetches the same expensive endpoint.
- **Medium** — No code-splitting (see §5) — all tabs plus Recharts in one bundle despite CLAUDE.md's "lazy children" description.
- **Low** — `daily_refresh_and_check` fires immediately on every process start (`main.py:155`), so routine Portainer redeploys trigger a full price-refresh burst, compounding the yfinance rate-limit risk.
- **Low** — `TechnicalsTab.jsx` (1331 lines), `OptionsTab.jsx` (764 lines), `BondsTab.jsx` (897 lines) are large single-file components bundling many unrelated sub-pieces, unlike `AllocationTab`'s five-file split — harder to review and re-renders more surface than necessary.

---

## 8. Accessibility Findings

- **High** — ARIA tab semantics were fixed for the Allocation sort pills (`aria-pressed`, `AllocationTab.jsx:126`) but the fix never propagated to sibling sub-tab bars: `PerformanceTab.jsx:22-42`, `TechnicalsTab.jsx:1122-1142`, `BondsTab.jsx:371-392`, `PortfolioAnalytics.jsx:528-547` are all plain button rows with no `role="tablist"`/`role="tab"`/`aria-selected`.
- **High** — `AccountFilterSheet.jsx` has no focus trap (see §4) — a straightforward a11y failure, not just a UX one.
- **Medium** — Toggle-button groups convey selection by color only, with no `aria-pressed`/`aria-selected`: `OptionsTab.jsx:467-480,487-521`, `TechnicalsTab.jsx:1008-1036`.
- **Medium** — Range sliders in `BondsTab.jsx:176-198` and `OptionsTab.jsx:740-763` render a sibling `<span>` label with no `aria-label`/`htmlFor` wiring to the `<input type="range">`.
- **Medium** — `HealthGauge`/`RSIGauge` SVGs (`TechnicalsTab.jsx:90-149`) convey their score only via in-SVG `<text>` with no `role="img"`/`aria-label`.
- **Medium** — `CryptoRiskDashboard.jsx:282-304` uses unassociated `<label>` text divs on its risk sliders — screen readers can't pair the label with the control.
- **Low/Medium** — Decorative emoji without `aria-hidden` scattered across `BondsTab.jsx:415`, `TechnicalsTab.jsx:780`, `Dashboard.jsx:146,326` — inconsistent with the correctly-hidden dot elsewhere in `Dashboard.jsx:224`.
- **Low** — Small colored badge text (9-11px on ~18%-alpha backgrounds, `shared.js:96`) is a contrast risk worth spot-checking given how pervasively badges appear.
- **Low** — Mobile three-dot menus in `ManageHoldings.jsx:742-777` lack `role="menu"`/`role="menuitem"`.

---

## 9. Feature Recommendations

Grouped by area, each with rough complexity/value:

**Data integrity & tax (High value, Large complexity)**
- Transaction ledger with FIFO/LIFO/specific-lot cost basis, feeding a year-end realized-gains export — the single biggest functional gap vs. Firefly III/Ghostfolio-class trackers, and directly useful at tax time.

**Crypto tooling (High value, Large complexity)**
- Move the trade journal, risk dashboard, setup scanner, and macro notes off `localStorage` into the DB so they sync across devices, survive a reinstall, and participate in backup/export/reset — currently the app's biggest architecture/durability gap.

**Alerts (Medium-High value, Medium complexity)**
- Per-holding drift thresholds (today it's portfolio-wide only), dividend/ex-date alerts, technical-signal alerts (RSI/MA cross — the data already exists in the crypto scanner, just not wired to alerts), and a snooze/mute option instead of delete-and-recreate to re-arm.

**Data portability (Medium value, Small-Medium complexity)**
- Bulk CSV/JSON import for brokerage and crypto holdings (today only Fidelity 401k CSV import exists; everything else is one-row-at-a-time). OFX/QIF export for interop with other finance tools.

**Analytics depth (Medium value, Medium complexity)**
- Custom date-range picker on the performance chart (today: fixed presets only); selectable benchmark beyond hardcoded S&P 500; Sharpe/Sortino/max-drawdown in the Risk sub-tab; per-chart CSV/PNG export (the whole-portfolio export endpoint exists but isn't surfaced per-chart).

**Self-hosted operability (High value, Small-Medium complexity)**
- `/api/health`, structured logging, a documented backup/restore path, and a startup guard against the default JWT secret — see §6, restated here as product features an operator will actually miss.

---

## 10. Innovation Ideas

Ten ideas aimed at closing the gap to best-in-class self-hosted apps (Immich's backup/restore polish, Home Assistant's system-health visibility, Linear/Notion's command palette, Obsidian's theming) while building on what's already here rather than bolting on the unrelated:

1. **Command palette (⌘K).** A Linear/Notion-style global launcher — jump to any ticker, tab, or action (Add Holding, Refresh Prices, Change PIN) from anywhere. Cheap to build given the existing route/action surface, and it's the single highest-leverage navigation fix given how deep Technicals/Options/Bonds currently sit.
2. **System Health panel in Settings** (Home Assistant-inspired). Surface last successful price refresh, last backup timestamp, DB file size, scheduler status, and recent yfinance failure count — turns the currently-invisible plumbing (§6/§7) into something the operator can actually see.
3. **One-click backup/restore** (Immich-inspired). A "Download full backup" button in Settings that snapshots the SQLite file (and, once §9's crypto-migration lands, everything else too), plus a guided restore flow — directly closes the Top 10 #5 gap as a user-facing feature, not just an ops task.
4. **Weekly digest push notification.** A Sunday-evening summary (performance vs. benchmark, dividends received, top movers, drift status) generated from data the app already computes — shifts the notification system from purely reactive alerts to a proactive habit-forming touchpoint.
5. **PWA install shortcuts.** Populate `manifest.json`'s `shortcuts` array (Add Holding, View Alerts, Today's Movers) for home-screen long-press quick actions, and add the missing `beforeinstallprompt` handling (§5) with an in-app "Install" CTA.
6. **Realized-gains / tax-lot ledger with a year-end export.** Turns §9's biggest data gap into a flagship feature — a "Tax Center" tab that exports a Form-8949-shaped CSV from the same transaction history that would also power undo and audit trail.
7. **Unified activity timeline.** A Linear-style history view of every add/edit/delete across holdings, alerts, and accounts — reuses the ledger from #6, and doubles as the audit trail an institutional-grade tool would expect.
8. **Crypto tools → DB migration with a one-time import wizard.** Pairs with §9: detect existing `localStorage` journal/risk/scanner data on first load post-migration and offer to import it into the new DB-backed tables, so no one's trade history silently disappears.
9. **Light theme + accent picker** (Obsidian-inspired). The entire app is hardcoded to one dark palette (`theme.js`) with no `prefers-color-scheme` support, despite already respecting `prefers-reduced-motion` — a light mode and an accent-color option would meaningfully raise the polish ceiling.
10. **Focus mode for simulators.** A distraction-free full-screen state for the Options P&L and Bonds YTM simulators that hides nav chrome — these are already the app's most "tool-like" surfaces (per §4's UX friction notes on session-not-persisted scenario state); pairing focus mode with scenario save/restore would make them feel like dedicated instruments rather than tab content.

---

## Appendix — Methodology

Four parallel deep-read passes were run against `master` @ HEAD: (1) backend/architecture/self-hosted deployment across all of `backend/*.py`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`; (2) core dashboard tabs (Overview, Allocation + children, Performance, Projection, Technicals, Bonds, Options) plus shared styles/hooks; (3) management/crypto/dividends/navigation chrome (ManageHoldings, AccountManager, AlertManager, Settings, Login, BottomTabBar, all Crypto* and Dividend* components); (4) PWA layer (service worker, manifest, offline handling, push, install flow). Each pass was instructed to assume the two prior scoped reviews' fixes are intact and to spot-check rather than re-report them — spot-checks confirmed both fix sets are present in current code.
