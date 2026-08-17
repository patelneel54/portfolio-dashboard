# Portfolio Dashboard — Comprehensive Product/UX/Architecture Audit

**Date:** 2026-08-17
**Reviewer:** Automated PM + UI/UX + full-stack architecture pass (three parallel deep-read agents: backend/self-hosted, frontend UI/UX/accessibility, PWA/feature-completeness), code-grounded against `HEAD` (`01f9c69`, "Add multi-brokerage / named-account support").
**Scope:** Whole application, first end-to-end pass since the two focused page-level reviews on 2026-04-11 (Settings) and 2026-04-12 (Allocation). Those reviews' fixes were verified intact and are **not** re-reported here except where new code has reopened related risk. Roughly four months and a dozen feature commits have shipped since (multi-brokerage accounts, dividend calendar with drill-down, redesigned Technicals, a new Bonds tab, an Options Strategy Simulator, push notifications, a crypto sub-app) — most of that surface has never been reviewed until now.
**Method:** Code-grounded static review (no live browser/Lighthouse/axe run this pass — matching the methodology of the prior two reviews). Findings are cited to `file:line`.

---

## 1. Executive Summary

This is a genuinely ambitious personal finance PWA — the analytics depth (technicals, bond metrics, options P&L simulation, dividend intelligence, rebalance suggestions, sector exposure) rivals paid products, and the native-feeling PWA touches (haptic pull-to-refresh, swipe navigation, iOS splash screens) are well above typical self-hosted-app polish. The codebase is also unusually clean of dead code — no stray TODOs, no console.log debris, no abandoned stub screens.

But the app has grown faster than its guardrails. Four findings below are serious enough to affect data trust or safety for the app's single real use case (a personal financial ledger the user relies on):

- A brand-new feature (the crypto trade journal) stores its data **only in browser localStorage**, with no backend table — a real loss risk on the exact platform (iOS Safari PWA) this app targets, since iOS aggressively evicts site storage.
- The documented deployment path (plain HTTP on a NAS IP) almost certainly **breaks the passkey/WebAuthn feature silently** — no browser exposes `navigator.credentials` outside a secure context, and nothing in the UI explains why.
- A schema migration added for the multi-account feature does **data-backfill DML** inside the same blanket `try/except: pass` originally meant only to swallow "column already exists" — a failed backfill can silently orphan holdings out of account totals with zero log trace.
- There is **no logging, no health check, and no error handling around the daily price-refresh/alert job** — if it throws, alerts silently stop firing and nothing anywhere tells the operator.

None of these are visible in the UI today — they're the kind of gaps that stay invisible until the day they cost real data or a missed alert. Recommend treating the Top 10 list below as the next work queue, roughly in the order given.

**Rubric (out of 100):** Correctness & data trust 15/20 (migration + journal risk) · Self-hosted operability 10/20 (no health/logging/backup story) · Accessibility 12/20 (new Options/Bonds/drill-down surfaces reintroduce keyboard gaps the April pass had just fixed elsewhere) · UI/IA consistency 13/20 (format-helper drift, 3-level tab nesting) · PWA 14/20 (excellent native feel, but offline mode only really covers one tab) · Feature completeness 11/20 vs. best-in-class trackers (no cost basis/tax lots, no realized gains, no global search). **Weighted total: ~62/100 — Functional and impressive for personal daily use; not yet "set it and forget it" safe as an unattended NAS deployment.**

---

## 2. Top 10 Highest-Impact Improvements

| # | Title | Category | Severity | Complexity | Value |
|---|---|---|---|---|---|
| 1 | Back the crypto trade journal with a DB table, not `localStorage` | Feature / Data-integrity | **Critical** | Small | High |
| 2 | Fix silent migration-backfill failures in `database.py` | Architecture | **Critical** | Small | High |
| 3 | Document/enforce HTTPS for WebAuthn; surface a clear in-app error when passkeys can't work | Security / PWA | **High** | Small | High |
| 4 | Add structured logging + scheduler job error handling | Architecture / Observability | **High** | Small | High |
| 5 | Add a `/api/health` endpoint + Docker `HEALTHCHECK` | Architecture | **High** | Small | Medium |
| 6 | Document and script a SQLite backup/restore procedure | Architecture | **High** | Small | High |
| 7 | Guard `ManageHoldings` add-holding form against NaN input | UX / Forms | **High** | Small | High |
| 8 | Fix keyboard access on new drill-down/slider UIs (PortfolioAnalytics, DividendCalendar, Options/Bonds sliders) | Accessibility | **High** | Medium | High |
| 9 | Extend offline caching beyond Overview (`/api/holdings`, `/api/settings`) to the rest of the read surface | PWA | **High** | Medium | Medium |
| 10 | Add cost-basis/tax-lot tracking and realized-gains reporting | Feature | **High** | Large | High |

Detail on each follows in the relevant section below.

---

## 3. UI Findings

**Design-system discipline has regressed as the app grew.** The Allocation review (2026-04-12) explicitly routed that tab's number formatting through `utils/format.js` (`fmtCurrency`/`fmtPct`). That discipline never propagated: a repo-wide check shows only `AllocationTab.jsx` imports `utils/format.js` today. Every newer surface — TechnicalsTab, OptionsTab, BondsTab, the four Dividend* components, PortfolioAnalytics, PerformanceTab, ProjectionTab, Dashboard.jsx — hand-rolls its own `.toFixed()`/`.toLocaleString()` calls, so decimal places, `$`/`%` placement, and sign handling now drift silently tab-to-tab. **Medium, UI.** Fix: adopt `fmtCurrency`/`fmtPct` app-wide in one pass; it's mechanical and low-risk.

**Duplicated slider component.** `OptionsTab.jsx:287-300,739-763` and `BondsTab.jsx:163-198` each define an identical `ensureSliderStyles()` + `SliderParam` block verbatim. A future fix to one (e.g. the accessibility fix in Finding #8 below) will silently miss the other unless both are updated by hand. **Medium, UI/maintainability.** Fix: extract to a shared `components/SliderParam.jsx`.

**Off-palette chart colors.** `DividendIncomeSection.jsx:10-13` defines its own `BAR_COLORS` array instead of reusing `theme.js` tokens (`C.blue`, `TICKER_COLORS`) — the only chart in the app with colors that don't match the rest of the palette. **Low, UI.**

**Split icon language.** `BottomTabBar.jsx:19-33` uses a custom line-art SVG icon set for navigation, while content areas (BondsTab bond-type icons, `TechnicalsTab.jsx:759`, Dashboard/OverviewTab empty states) fall back to raw emoji glyphs. Reads as two different design eras stitched together. **Nice-to-Have, UI.**

**Mislabeled badge.** `DividendEventsTimeline.jsx:291` hardcodes the badge text `"Ex-Div"` even when the active filter is `est-payment` and the row is actually sorted/dated by estimated *payment* date — the label contradicts the data shown. **Medium, UI/correctness.** One-line fix: make the badge text conditional on `filter`.

**Native `window.confirm()` breaks theme immersion.** `AccountManager.jsx:87` is the only place in the app using the browser's native confirm dialog for a destructive action (deleting an account), instead of the themed confirm pattern used everywhere else (Dashboard's "Dismiss All", RebalancePlanner's copy-state). Jarring inside an installed, chrome-less PWA. **Low, UI.**

**Desktop layout underuses width.** `Dashboard.jsx:316`'s top stats grid is hardcoded `repeat(2, 1fr)` at every viewport size, so desktop users see the same 2-column layout as a phone despite having room for 4. **Nice-to-Have, Responsive.**

---

## 4. UX Findings

**Navigation has grown to three decision-levels deep.** `BottomTabBar.jsx:35-58` exposes 7 top-level tabs (plus a "More" overflow) in stock mode; several of those open sub-tab pill bars (`PerformanceTab.jsx:9-14`, `PortfolioAnalytics.jsx:428-433`, `TechnicalsTab.jsx:823-828`, `BondsTab.jsx:261-266`); `PortfolioAnalytics` adds a third level via its sector→stock breadcrumb drill-down. Crypto mode is effectively a 6th top-level context layered on top. A user checking "how risky is my sector concentration" now taps bottom-tab → Overview → Analytics card → Risk sub-tab — three decisions for something that used to be one tap. **High, IA/UX.** This is the single biggest structural UX issue in the app; worth a dedicated IA pass rather than a point fix (see Innovation Ideas for a command-palette mitigation).

**Redundant network fetches inside one tab.** `DividendCalendarSection.jsx:34-37` fetches the current month's dividend calendar, then unconditionally renders `<DividendCalendar>`, which independently re-fetches the same month itself (`DividendCalendar.jsx:379`) — a duplicate call every time the Calendar sub-tab opens. `DividendEventsTimeline.jsx:74-83` fetches 7 more months separately when its own sub-tab opens, with no shared cache across the three sibling components. **Medium, Performance/IA.** Fix: lift the fetch to `DividendCalendarSection` and pass data down, or add a small shared cache keyed by month range.

**Inconsistent error handling for the same data domain.** `DividendCalendarSection.jsx:40-42` and `DividendEventsTimeline.jsx:125-129` both swallow fetch failures in an empty `catch {}` (with a "non-critical" comment) — on failure, the comparison strip / yearly chart just silently vanishes. The sibling `DividendCalendar.jsx:501`, covering the same dividend data on the same tab, correctly renders an `InlineError` + Retry. **Medium, UX.** Fix: make the two silent catches match the pattern already proven correct next to them.

**`ErrorBoundary`'s retry doesn't actually retry.** `ErrorBoundary.jsx:39-54`'s "Tap to retry" only clears the boundary's local `hasError` flag — it never re-triggers the failed data fetch, so an API-response-caused error recurs immediately on tap. This boundary is now used far more heavily since Options/Bonds/Technicals sub-widgets were each wrapped individually. **Medium, UX.** Fix: accept an optional `onRetry` prop that re-invokes the parent's fetch.

**Silent-success on a real failure, again.** `Login.jsx:47-58`'s `handleEnableBiometric` catches registration errors with only `console.error` and unconditionally calls `navigate('/')` regardless of outcome — a failed passkey enrollment is presented to the user as a success. This is the same defect class the Settings review fixed on the biometric toggle inside Settings (D1), but on the separate Login-screen enrollment path, which was never touched by that pass. Given Finding #3 (WebAuthn likely broken over plain HTTP), this failure path will be hit by real users following the documented deploy flow. **High, UX/Accessibility** (compounds with #3 above).

**Buried primary content.** `BondsTab.jsx:261-266` puts "My Bonds" — the user's actual holdings, presumably the reason they opened the tab — as the 4th and last sub-tab, behind three educational tabs (Bond Types, Calculator, Ladder Builder). A returning user pays an extra tap past marketing/education content on every visit. **Nice-to-Have, UX.** Fix: default to "My Bonds" when the user has bond holdings, education tabs otherwise.

**Account management is buried relative to how often it's needed.** The account switcher used daily (`AccountFilterSheet.jsx`, in the Dashboard header) has no path into renaming/managing accounts — that only exists inside Settings. Renaming a brokerage account is Dashboard → Settings → scroll → edit → back → reopen filter sheet. **Medium, IA.** Fix: add a "Manage accounts" entry point directly from the filter sheet.

---

## 5. PWA Findings

**Offline mode only really covers one tab.** `sw.js:10,52-100` applies stale-while-revalidate to exactly two endpoints, `/api/holdings` and `/api/settings`; every other `/api/*` GET (technicals, dividends, performance, options, bonds, crypto, alerts — roughly 13 more endpoints) is network-first with a cache fallback that will almost always miss since those responses were never cached (`sw.js:103-108`). In practice, "offline mode" means Overview shows stale numbers while Technicals/Performance/Dividends/Options/Bonds/Crypto go blank or throw. **High, PWA.** Fix: extend the SWR path list (or pattern-match `/api/*` GETs generally) to the rest of the read-heavy surface, and give the uncached tabs an explicit "unavailable offline" empty state instead of a raw fetch failure.

**Cache versioning is manual and easy to forget.** `sw.js:1-2` hardcodes `STATIC_CACHE = 'portfolio-v3'`; bumping it is what triggers cache purge and the update banner (`sw.js:36-50`). `vite.config.js` already computes `__APP_VERSION__`/`__APP_COMMIT__` at build time but nothing wires that into the cache-name constant — a deploy that forgets to bump the string ships stale JS/CSS with no update banner. **Medium, PWA.** Fix: template the cache name from the build-time version/commit.

**Push notifications aren't batched and deep-link coarsely.** `main.py:107-132` fires one push per triggered alert with no digest/aggregation — a volatile day with 5 triggered alerts sends 5 separate pushes. Every push's `data.url` also defaults to `/` rather than the specific ticker/alert, so a tap always lands on the dashboard root instead of the relevant screen, even though the tap-to-deep-link mechanics themselves work correctly (`sw.js:184-203`). **Medium, PWA/UX.** Fix: batch same-tick alerts into one summary push; set `data.url` to the ticker/tab that triggered it.

**No periodic service-worker update check.** `index.html:53-58` registers the SW once on load with no polling `registration.update()` call — a PWA left open for days won't surface the update banner until a hard reopen. **Low, PWA.** Fix: `setInterval(() => reg.update(), 60*60*1000)` or check-on-focus.

**Manifest is solid but missing shortcuts.** `manifest.json` is otherwise complete (standalone display, theme/background color, maskable + `any`-purpose icons at the right sizes). Missing `shortcuts` (e.g. long-press → "Add Alert," "Refresh Prices") that similarly-scoped self-hosted PWAs (Home Assistant) use for quick actions. **Nice-to-Have, PWA.**

**What's working well (worth preserving, not a finding):** `PullToRefresh.jsx` implements real resistance/damping/haptics rather than a fake spinner; `SwipeContainer` gives genuine tab-swipe gestures; iOS splash screens are wired via `apple-touch-startup-image` media queries; `env(safe-area-inset-*)` is respected in the update banner. This native-feel investment is genuinely above the self-hosted-app norm and should be the bar for any new UI, not something to unwind.

---

## 6. Self-Hosted Architecture Findings

**Migration DML now hides behind an exception-swallow meant for DDL.** `database.py:114-134` — the multi-account migration (2026-04-12) added `INSERT OR IGNORE INTO accounts ... SELECT DISTINCT` and `UPDATE holdings SET account_id = (subquery)` backfill statements inside the same blanket `try/except: pass` that was originally written only to make repeated `ALTER TABLE ADD COLUMN` calls idempotent. If the backfill fails partway (lock contention, disk pressure, unusual pre-existing data), the exception is discarded silently, some holdings are left with `account_id = NULL`, and the new unique index doesn't catch duplicates under NULL (SQLite treats each NULL as distinct) — those holdings then quietly disappear from `/api/accounts` totals while still showing in `/api/holdings`, with no log line either way. **Critical, Architecture / Data-integrity.** Fix: split idempotent DDL from one-time data backfills; give backfills a real schema-version gate instead of exception-swallowing, and log failures instead of `pass`.

**No health endpoint, no Docker healthcheck.** No `/health` route in `main.py`, no `HEALTHCHECK` in `Dockerfile`, no `healthcheck:` block in `docker-compose.yml`. `restart: unless-stopped` only reacts to a process exit, not an app that's up but broken (corrupted DB file, dead scheduler). **High, Architecture.** Fix: add `GET /api/health` (checks DB connectivity) plus a Dockerfile `HEALTHCHECK CMD curl -f http://localhost:8000/api/health`.

**No backup/restore procedure documented anywhere.** SQLite lives in a named Docker volume (`docker-compose.yml:9-10`) in WAL mode (`database.py:97`); README covers deploy and PIN-hash generation only. A naive file copy of `portfolio.db` while the app is running risks missing `-wal`/`-shm` content. **High, Architecture.** Fix: document/script `sqlite3 portfolio.db ".backup backup.db"` on a schedule, plus a restore walkthrough.

**No logging anywhere in the backend.** A repo-wide check for `logging`/`getLogger`/`basicConfig` across `backend/*.py` turns up nothing except `print()` in the standalone `seed_401k.py` script. Combined with dozens of bare `except Exception: pass/continue` sites in `stock_service.py`, the honest answer to "what would an operator see at 2am if something broke" is **nothing** — only uvicorn's unstructured stdout access log. **High, Architecture/Observability.**

**The daily refresh/alert job has no error handling.** `daily_refresh_and_check` (`main.py:135-138`) has no try/except and no `EVENT_JOB_ERROR` listener registered on the scheduler. If `refresh_all_prices()` throws, `check_alerts()` never runs that day and no push notifications go out — invisibly, since there's no logging either (compounds directly with the finding above). **High, Architecture/Observability.** Fix: wrap the job body, log failures explicitly, register an error listener.

**WebAuthn requires a secure context; the documented deploy doesn't provide one.** README's deployment flow (`README.md:16-17`) is plain `http://<NAS-IP>:8000` with no TLS. The WebAuthn spec requires HTTPS (or exactly `localhost`) before `navigator.credentials` even exists in the browser — so the passkey feature shipped in commits `a060e0c`/`d67788e` is very likely non-functional for anyone following the README as written, with no explanation surfaced anywhere in the UI. **High, Security/PWA.** Fix: document a reverse-proxy TLS example (Caddy/Traefik/Tailscale) in the README, and add a runtime check that shows "Passkeys need HTTPS" instead of a silent failure.

**yfinance fetches are sequential, unbatched, and untimed.** `stock_service.py:57-130` loops one ticker at a time via `yf.Ticker(t).fast_info`, not batched through `yf.download(tickers, ...)`, with no per-call timeout and a bare `except: continue` — a large portfolio scales linearly, and silent Yahoo-side throttling produces no signal anywhere. **Medium, Performance.**

**Other findings (lower severity, full detail in prior conversation transcript, condensed here for report length):**
- No rate limiting on the WebAuthn `auth-options`/`auth-verify` routes, unlike `/auth/login` (Medium, Security — `main.py:289-296`).
- `AUTH_PIN` plaintext can linger in Portainer env vars indefinitely after a hash is generated; README's "deploy without a PIN" flow encourages this pattern (Medium, Security — `docker-compose.yml:13-14`).
- `backend/requirements.txt` pins no upper bounds and has no lockfile; `yfinance` in particular is known to break on Yahoo's undocumented endpoint changes (there's already a version-conditional workaround at `stock_service.py:588`, evidence this has bitten the project before) (Medium, Architecture).
- No schema-version table — migrations rerun probe-and-swallow on every boot with no record of which actually applied (Medium, Architecture).
- Inconsistent error-response shape between newer analytics routes (structured 500 with leaked exception text) and core CRUD routes (bare unhandled exception) (Low, Architecture).
- `accounts.name` is globally unique rather than unique-per-`account_type`, blocking two same-named accounts of different types (Nice-to-Have).
- CORS origins hardcoded to dev ports only, `allow_credentials=True` is inert given Bearer-token auth (Nice-to-Have, cleanup).

---

## 7. Performance Findings

- **Sequential, unbatched yfinance calls** (`stock_service.py:57-130`) — see §6; batching via `yf.download` would meaningfully cut daily-refresh time as the ticker count grows. **User impact: Medium** — currently invisible on a small personal portfolio, becomes a real multi-minute-refresh problem as holdings scale.
- **Duplicate dividend-calendar fetches within one tab** (`DividendCalendarSection.jsx`/`DividendCalendar.jsx`) — see §4. **User impact: Low-Medium**, extra network round trip and battery cost on every calendar open, more noticeable on cellular.
- **Bundle size**: prior review noted a 1.03 MB / 280 KB gzip single bundle with a Vite chunk-size warning; the newer Options/Bonds/Crypto surfaces have added meaningfully more code since without any code-splitting introduced (no `React.lazy` usage found for tabs beyond what CLAUDE.md already documents as lazy). **User impact: Medium** on first load over cellular; a natural next step given how many tabs now exist.
- **No caching/memoization concerns found beyond the above** — `useMemo` is used appropriately in the components sampled (DriftAnalysis, PositionConcentration per the prior review; consistent pattern seen elsewhere this pass).

---

## 8. Accessibility Findings

The April reviews closed a real batch of keyboard/ARIA gaps on Settings and Allocation specifically — but the same defect class has reappeared, unfixed, on every major surface shipped since:

- **`PortfolioAnalytics.jsx:68-93` (Breadcrumb) and `:106-158` (SectorsSubTab)** — the sector → sector-detail → stock drill-down trail and the sector bar/list rows use `<span onClick>` / `<div onClick>` with no `tabIndex`, `role`, or key handler. This is the *only* way back up from a 3-level drill; keyboard and screen-reader users get stuck with no way out. **High.**
- **`DividendCalendar.jsx:38-63` (DayCell)** — calendar days with dividend events are `onClick`/`onMouseEnter` only; opening the Day Detail sheet (the calendar's core interaction) is entirely unreachable without a mouse/touch, and the tap target itself is under the 44px guideline once padding is subtracted at 320px width. **High.**
- **`OptionsTab.jsx:740-763`, `BondsTab.jsx:176-198` (SliderParam)** — labels sit in sibling `<span>`s never associated via `<label htmlFor>`/`aria-labelledby`. A screen reader announces 6+ unlabeled "slider" controls per tab (Stock Price, Strike, Premium, IV, Days to Expiry / Face Value, Coupon, YTM) — these are the primary inputs of two brand-new simulator tabs. **High.**
- **`DividendEventsTimeline.jsx:400-408`** — per-ticker growth-expand rows are `<div onClick>` with no keyboard support or `aria-expanded`. **Medium.**
- **`Login.jsx` biometric enrollment failure is silent** — see §4; a failed passkey registration presents as success with no announced error. **Medium** (accessibility angle: no `role="alert"` surface at all, unlike the equivalent Settings flow).

Fix approach for all of the above: the April pass already established the right pattern (tabIndex={0} + onFocus/onBlur driving the same hover state, aria-expanded/aria-controls on disclosures) — this is mechanical replication of that pattern onto the newer components, not new design work.

---

## 9. Feature Recommendations

| Feature | Value | Complexity | Notes |
|---|---|---|---|
| Cost-basis / tax-lot tracking | High | Large | `holdings` (`database.py:8-22`) has one blended `avg_cost` per ticker/account — no lots table, so FIFO/LIFO/specific-lot selection and short/long-term gain classification are impossible. Table stakes for Sharesight/Ghostfolio/Personal Capital. |
| Realized-gains / tax reporting | High | Medium-Large | Follows directly from lot tracking — no `transactions` table exists, so there's no way to answer "what did I realize this year." |
| Back crypto trade journal with a DB table | High | Small | See Top 10 #1 — currently `localStorage`-only (`CryptoTradeJournal.jsx:6-13`), a real loss risk on iOS Safari, and doesn't sync across devices despite the app being multi-device installable. |
| Global search / quick-switcher (Cmd/Ctrl-K) | Medium | Small | Confirmed no such feature exists — `SearchInput.jsx` is only a local list filter inside `ManageHoldings` and `AllocationTab`. With 7+ tabs and 3-level nesting (§4), a jump-to-ticker-or-tab palette would materially cut navigation friction. |
| Watchlist for unowned tickers | Medium | Small | No table/route exists; users can't track a ticker they're considering without adding a fake holding. |
| Digest/batched push notifications | Medium | Small | See §5 — infrastructure already exists, this is a batching change to `check_alerts()`. |
| Net-worth / non-brokerage assets (cash, real estate) | Medium | Medium | The existing manual-holding + `benchmark_ticker` proxy pattern (`main.py:365+`) is a natural, low-effort base to extend into a generic "no-ticker, user-valued asset" type. |
| Historical portfolio snapshot / time-machine view | Medium | Medium | `price_history` stores per-ticker OHLC but nothing at the portfolio-allocation level, so there's no "what did my allocation look like 6 months ago." |
| Generic CSV/OFX import beyond Fidelity | Low-Medium | Medium | Likely intentionally scoped to the user's actual broker — flag, don't over-prioritize. |
| Multi-currency support | Low-Medium | Large | No currency column anywhere in schema; reasonable to leave out-of-scope for a US-only personal deployment, but worth naming explicitly as a deliberate non-goal rather than a silent gap. |

---

## 10. Innovation Ideas

Ten ideas to make the app feel more differentiated, roughly ordered by leverage relative to effort:

1. **Command palette (Cmd/Ctrl-K or a floating search FAB on mobile)** that jumps directly to any ticker, tab, or sub-tab — the single highest-leverage fix for the 3-level IA problem found in §4, without having to flatten the navigation itself.
2. **"Today" digest notification** — one daily push summarizing price moves, triggered alerts, and dividend payments due, instead of (or in addition to) per-alert pushes; reuses the existing push infrastructure and directly fixes the notification-spam gap in §5/§9.
3. **Drift-nudge automation** — since rebalance suggestions already exist but are pull-only, a scheduled check that proactively pushes "you've drifted 6% from target, tap to see the rebalance plan" turns an analytics feature into an automation feature with almost no new backend work.
4. **Manifest `shortcuts`** for "Refresh Prices" and "Add Alert" as long-press home-screen actions — small, cheap, genuinely native-feeling.
5. **Cost-basis/lots + realized-gains export with a signed manifest** (generation timestamp, git SHA, checksum) — turns the existing CSV/JSON export into something that could actually serve as tax-season evidence, closing both the biggest feature gap (§9) and the evidentiary-metadata gap the April Settings review flagged as still open.
6. **Portfolio time-machine slider** — a single date slider that replays historical allocation snapshots, using the already-collected `price_history` table plus a small new portfolio-snapshot table; visually distinctive and something few self-hosted trackers offer.
7. **Per-account health/staleness indicator** — a small badge on each account in `AccountFilterSheet` showing "last refreshed 2 min ago" vs. "refresh failed 3 days ago," which becomes possible for free once the logging/error-handling fix in §6 lands.
8. **Unified icon system pass** — replace the emoji glyphs with the same line-art SVG set already used in `BottomTabBar`, closing the "two design eras" feel noted in §3 at low cost.
9. **Sector/factor benchmark overlay (vs. SPY)** — flagged as a trader-perspective gap in the April Allocation review and never built; would meaningfully raise the app's "institutional-grade" feel for the Allocation/Analytics tabs.
10. **One-tap "Explain this number" info affordance** on complex metrics (HHI, Greeks, YTM, drift) — a small `?` that expands an inline plain-English explanation, useful given how dense the Options/Bonds/Analytics surfaces have become for a single-user tool that's meant to build the user's own financial literacy over time.

---

*Prior related reports: `docs/beta-review-settings-2026-04-11.md`, `docs/allocation-review-2026-04-12.md`. This report supersedes neither — it covers the whole app, with those two page-level passes' fixes verified intact and excluded from re-reporting.*
