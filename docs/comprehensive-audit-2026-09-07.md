# Portfolio Command Center — Comprehensive Product Audit

**Date:** 2026-09-07
**Reviewer:** Automated PM / UI-UX / Full-Stack Architecture pass (recurring scheduled audit)
**Scope:** Entire application — backend (`backend/`), frontend (`frontend/`), PWA layer, Docker/self-hosted deployment. This is a whole-app pass; it supersedes the narrower `docs/beta-review-settings-2026-04-11.md` and `docs/allocation-review-2026-04-12.md` component reviews for anything that overlaps, and does not re-litigate defects those passes already fixed (JWT invalidation on PIN change, login rate limiting, `require_auth` DB-hash precedence, keyboard reachability on Allocation-tab overlays, etc. — all confirmed still in place at this HEAD).
**Method:** Static, code-grounded review (full read of `main.py`, `database.py`, `stock_service.py`, `auth.py`, `webauthn_routes.py`, `fidelity_csv.py`, and all 46 frontend components/hooks/styles). No runtime Lighthouse/axe pass, no live browser walkthrough — findings are cited to `file:line` throughout.

---

## 1. Executive Summary

Six months into development (39 commits since the initial commit), this has grown from a personal stock tracker into a genuinely feature-rich, three-account (brokerage / 401k / crypto) financial command center: technicals with RSI/MACD/support-resistance, a Black-Scholes options simulator, bond ladder/duration tooling, dividend intelligence with projected payments, sector/factor analytics, rebalance planning, Fidelity CSV import, WebAuthn passkeys, and Web Push alerts. For a single-developer, self-hosted side project, the feature depth is well above what "portfolio tracker" implies and starts to compete with paid products.

That depth has outpaced the plumbing around it. Three issues would be release-blocking for anyone other than the original author running it on a private LAN:

1. **The app ships insecure by default and the README actively walks operators into that state.** No PIN configured → zero authentication, no warning, and the documented first-deploy path *is* "leave it open."
2. **WebAuthn/passkeys cannot function on the one deployment path the README documents** (plain HTTP on a NAS IP) — a fully-built feature that silently doesn't work.
3. **There is no operational visibility** — no health check, no logs, no backups, no monitoring — so if the daily refresh job or a migration silently fails, nobody finds out until the data looks wrong.

None of these are hard to fix; all are cheap relative to the feature work already shipped. Below them is a long tail of real but lower-stakes UI/UX/accessibility/performance findings — a genuinely low-contrast text token used sitewide, several accessibility gaps in custom sub-tab bars and sliders, no code-splitting despite seven-plus heavy tabs, and a PWA offline story that only covers two endpoints. None of these are exotic — they're the normal residue of feature velocity outpacing polish passes, and they're all addressable incrementally.

**Overall assessment:** Feature-complete for personal use today; not yet safe to expose beyond a trusted LAN, and not yet polished to the standard its own analytics depth deserves.

---

## 2. Top 10 Highest-Impact Improvements

Ranked by (severity × how cheap the fix is). Full detail for each lives in its section below.

| # | Title | Category | Priority | Why it's #1-10 |
|---|---|---|---|---|
| 1 | Fail loud (or refuse to boot) when no PIN is configured | Security | **Critical Bug** | Silent full-API auth bypass is the single worst thing in the app; the README currently recommends deploying this way. |
| 2 | Fix `JWT_SECRET` footguns (weak example value + empty-string-from-Docker) | Security | **Critical Bug** | A guessable or empty signing secret makes the PIN/rate-limiting/WebAuthn work in §7 of the prior Settings review moot — anyone can forge a token. |
| 3 | Make WebAuthn either work (docs for reverse-proxy+TLS) or fail with a clear message | PWA / Security | High Priority | A fully-implemented feature (register, verify, delete, login) is non-functional on the only documented deployment path, with no error explaining why. |
| 4 | Add `/api/health`, structured logging, and an APScheduler failure listener | Architecture | High Priority | Right now a broken daily refresh, a broken migration, or a wedged container produces zero operator-visible signal. |
| 5 | Fix the `C.textDim` contrast failure (≈2.9:1, sitewide) | Accessibility | High Priority | One token, used for disclaimers/timestamps/axis labels across nearly every tab — single fix, broad impact. |
| 6 | Code-split routes/tabs and lazy-load `recharts`-heavy tabs | Performance | High Priority | All 7+ tabs (Options/Bonds/Technicals included) ship in the initial bundle regardless of which one the user opens. |
| 7 | Give the PWA a real offline story beyond Holdings/Settings | PWA | High Priority | Technicals, News, Performance, Dividend, Crypto — nearly the whole app — go blank offline with no coherent message. |
| 8 | Parallelize the N+1 yfinance fetch loops (portfolio-intelligence, portfolio-analytics, price refresh) | Performance | Medium Priority | Serial per-ticker network calls turn a 20-holding portfolio into a multi-second wait on cold cache and on every daily refresh. |
| 9 | Make destructive actions consistent and safer (no `window.confirm`, add archive-before-reset) | UX | Medium Priority | Three different confirm patterns coexist; "Reset All Data" is one click + a JS confirm dialog with no recovery path. |
| 10 | Add automated SQLite backups + a documented restore procedure | Architecture | High Priority | Single SQLite file in a Docker volume, zero backup tooling, zero README guidance — total data loss is one bad `docker volume rm` away. |

---

## 3. UI Findings

| Finding | Why it's a problem | Usability impact | Suggested fix |
|---|---|---|---|
| **Undefined color token** — `Settings.jsx:638` uses `background: C.bgCard`, but `theme.js` never defines `bgCard` (only `bg`, `card`, `cardHover`, `elevated`). | Resolves to an invalid CSS value; the browser silently ignores it. | The export-account `<select>` on the Settings/Data page falls back to browser-default (usually white) background, breaking dark-theme consistency in an otherwise fully-themed app. | Replace with `C.card` or `C.elevated`. |
| **`C.textDim` (#5A5A6E on #0B0B0F) is ≈2.9:1 contrast**, used for disclaimers, timestamps, table sub-labels, hint text, and chart axis ticks across nearly every tab. | Fails WCAG AA (4.5:1 normal text, 3:1 large text) by a wide margin. | Low-vision users and anyone in bright ambient light (a real scenario for a phone-first PWA) will struggle to read disclaimers and axis labels — ironic for a finance app where the fine print matters. | Darken the background or lighten the token to at least 4.5:1; audit every `textDim` call site (it's a systemic token, not a one-off). |
| **`ProjectionTab` milestone grid has zero responsive behavior** (`gridTemplateColumns: repeat(${milestones.length}, 1fr)`, typically 4 columns, no media query) — the only tab-level grid in the app without a mobile branch. | Every other multi-column grid in the app (`AllocationTab`, Accounts summary) branches on `useMediaQuery`; this one doesn't. | On a narrow phone, four milestone cards squeeze into ~80px each and text wraps/crowds. | Reuse the same `isMobile` pattern already established in `AllocationTab.jsx` — collapse to 2 columns under ~480px. |
| **Three incompatible "confirm delete" patterns**: a custom 3-second timed `ConfirmButton` (Settings danger zone), a full custom modal (`ManageHoldings`), and bare `window.confirm()` (`AccountManager.jsx:87`, Settings unsaved-changes check). | Native `confirm()` can't be themed, breaks visual consistency, and reads jarringly different from the rest of the app. | Users get an inconsistent "how serious is this action" signal depending on which screen they're on. | Standardize on one confirm pattern (the existing modal is the most accessible; promote it to a shared component). |
| **Account-type color mapping duplicated in 5+ places** (`Dashboard.jsx:226`, `OverviewTab.jsx:40`, `AllocationTab.jsx:200`, `HoldingCard.jsx:4-8`, `AccountFilterSheet.jsx:4-9`) instead of the existing `ACCOUNT_COLORS` export already in `theme.js:33`. | Classic single-source-of-truth violation. | If a color is ever changed, it's easy to update 4 of 5 call sites and end up with mismatched badge colors between screens. | Import `ACCOUNT_COLORS` everywhere instead of re-declaring the map. |
| **Push opt-in banner and triggered-alerts banner look nearly identical** (same padding/border-radius/font-size, stacked directly above the stats grid). | No visual hierarchy separates "you have an actionable portfolio alert" from "would you like to enable notifications." | A user who habitually dismisses the (lower-stakes) push prompt could reflexively dismiss a real drift/price alert sitting right next to it. | Give the alerts banner a distinct, higher-urgency treatment (color, icon, position above the push prompt). |
| **Icon set has no single source of truth** — all custom inline SVG, hand-maintained across `BottomTabBar.jsx`'s `ICONS` map and various one-off inline SVGs. | Stroke width/corner radius consistency depends entirely on manual discipline. | Minor but compounding visual drift as more icons are added by different passes. | Extract a small shared icon component/sprite sheet. |
| **Desktop `AllocationTab` table renders 11–13 columns at 12px font, non-virtualized**, relying on `overflowX: auto`. | At typical laptop widths this either forces horizontal scroll or extreme truncation. | Power users comparing many holdings side-by-side get a cramped, scroll-heavy table instead of a scannable grid. | Consider a column-priority system (always show ticker/value/gain-loss, progressively disclose the rest) or a toggle between "compact" and "full" column sets. |
| **Single dark theme only** — no light-mode tokens exist in `theme.js`, no toggle anywhere in Settings. | Most competitor apps (Notion, Linear, GitHub) ship both; some users need light mode for accessibility (photosensitivity) or simply prefer it in daylight. | Not a bug, but a gap relative to "best-in-class" bar. | Nice-to-have, not urgent for a single-user app — flagged for the Feature section. |

---

## 4. UX Findings

| Finding | Why it's a problem | Suggested simplification |
|---|---|---|
| **Account-filter switch is a low-affordance pill** under the page title that opens a bottom sheet, with no persistent "you're viewing Brokerage only" indicator beyond that small pill. | Easy to forget a filter is active and misread portfolio totals as "everything" when they're actually one account. | Add a persistent, higher-contrast filter chip in the header, and show the active filter name in page titles / export dialogs. |
| **Switching account filters silently resets the active tab to Overview** (`Dashboard.jsx:369-370`). | A user deep in Technicals or Options for a specific ticker loses all context with zero explanation when they change accounts. | Preserve the active tab across filter changes where the tab is still valid for the new filter (fall back to Overview only when it isn't, e.g., Allocation on a 401k-only filter). |
| **Sub-tabs nested inside tabs, 4 different implementations** (`PerformanceTab`, `TechnicalsTab`, `BondsTab`, `PortfolioAnalytics`), none exposing `role="tablist"`/`aria-selected`, all visually distinct from each other and from the primary Dashboard tab bar. | Cognitive overhead: users must learn "tabs inside tabs" separately for each screen, with no consistent visual language. | Extract one shared `SubTabBar` component (with proper ARIA) and use it everywhere sub-navigation exists. |
| **Options and Bonds tabs are single continuous scrolls** — strategy picker, 4–6 sliders, payoff chart, stats, Greeks toggle, and disclaimer all in one flow with no sticky summary. | Deep in the Greeks section, the user has scrolled past the strategy/price context that gives the numbers meaning. | Add a small sticky header (current strategy + key P&L stat) that persists while scrolling. |
| **No undo after deleting a holding** — confirm-then-permanent, no recovery path. | For manually-entered data (cost basis, purchase date), losing a holding to a mis-tap is real data loss with real re-entry cost. | Add a 5–10s "Holding deleted — Undo" toast before the delete actually commits, or soft-delete with a trash/restore view. |
| **Misleading empty state when filtered** — the "No Holdings Yet" empty state checks the *filtered* holdings count (`Dashboard.jsx:324-332`), not total holdings, so a user filtered to Crypto with zero crypto (but plenty of brokerage) holdings sees a message implying the whole portfolio is empty. | Could prompt a user to re-add holdings they already have, just filtered out of view. | Change copy to "No {accountType} holdings yet" and surface a one-tap "switch to All accounts" affordance. |
| **Unsaved-changes warning only fires on full navigation, not on in-page Settings tab switches** (`Settings.jsx:808-810`). | Switching from Projections → Alerts inside Settings silently discards uncommitted projection edits — the guard that exists doesn't cover the more common path. | Extend the same dirty-check to the internal tab switcher, not just the "Back to Dashboard" button. |
| **PIN policy mismatch** — Login screen visually implies a numeric-only PIN (`inputMode="numeric" pattern="[0-9]*"`), but the change-PIN form in Settings only enforces length ≥ 4 with no numeric constraint. | A user could set a PIN incompatible with the login screen's own implied affordance. | Enforce the same numeric constraint (or explicitly support alphanumeric PINs everywhere, including the login input mode). |
| **Options/Bonds parameter sliders have no direct numeric entry** — drag-only for stock price, strike, IV, etc. | Imprecise for a financial calculator where users often want to type an exact number ("what if AAPL hits exactly $215"). | Pair each slider with a synced numeric `<input>`. |
| **No autocomplete/typeahead on ticker entry** (`SearchInput.jsx` is a plain filter-as-you-type box with no suggestion list; `ManageHoldings` ticker field is a bare text input). | Users must know the exact ticker symbol; no company-name search, no fuzzy match, no "did you mean." | Add a debounced ticker-search endpoint (yfinance supports symbol search) with an autocomplete dropdown. |
| **No bulk actions anywhere** — confirmed no multi-select/bulk-edit/bulk-delete in `ManageHoldings.jsx` (its only checkboxes are single-row "is manual" toggles). | Re-targeting 15 holdings after a life event (new target allocation strategy) means 15 individual edits. | Add multi-select with bulk target-allocation edit and bulk delete. |

---

## 5. PWA Findings

| Finding | Why it's a problem | Suggested fix |
|---|---|---|
| **No offline queuing / Background Sync for mutations.** Every `POST`/`PUT`/`PATCH`/`DELETE` (add holding, dismiss alert, save settings) goes through `apiFetch` with no offline queue; the service worker only special-cases `GET` (`sw.js:52-108`). | If the network drops mid-edit, the request just fails — no natural "retry when back online," despite this being exactly the scenario an installed PWA should handle gracefully. | Adopt the Background Sync API (or an IndexedDB-backed retry queue) for mutation requests. |
| **SWR caching covers only 2 endpoints** (`/api/holdings`, `/api/settings`); everything else — Technicals, Price History, Performance, Portfolio Analytics, Dividends, Crypto, News, Fundamentals, Bond Metrics — falls into a "network-first, else `caches.match`" branch that was never populated by a `cache.put()`, so it's a guaranteed miss offline. | Nearly the entire app beyond the Overview tab goes blank offline, each showing its own generic "No data" state rather than a coherent "you're offline" message. | Extend the SWR path list to the read-heavy analytics endpoints (with sensible TTLs), and add an app-level offline banner instead of per-tab empty states. |
| **Update flow does a full `window.location.reload()`** on the `SW_UPDATED` banner click, discarding any in-progress state (unsaved Settings edits, mid-flow options simulator inputs). | Acceptable as a mechanism, but there's no "update later, remind me next session" — the banner reappears every session until the user reloads. | Low priority; consider persisting a "remind me later" dismissal per version. |
| **Push opt-in "Later" is permanent** (`localStorage.push_prompt_dismissed = '1'`, `Dashboard.jsx:277`) with no dashboard-level path back to it — users must know to dig into Settings → Notifications. | A user who dismisses in a distracted moment effectively loses the feature unless they remember where to re-enable it. | Re-prompt after N days, or surface a persistent small "🔔 Enable alerts" affordance in Settings that's easy to find. |
| **`notificationclick` only navigates when no window is currently open** (`sw.js:191-201`) — if a tab is already open (even on an unrelated route), it just focuses that tab without navigating to the alert's deep link. | Tapping a price-alert push notification while the app happens to already be open silently fails to take the user to the relevant screen. | Always call `client.navigate(data.url)` (or postMessage a client-side route change) before/instead of just `focus()`. |
| **`manifest.json` has no `shortcuts` array** despite natural candidates (Add Holding, Refresh Prices, Crypto view) and no `screenshots` field (used by richer Android/desktop install prompts). | Missed "native-app-like" polish that's essentially free once the routes already exist. | Add both — this is a small, high-leverage PWA-maturity win. |
| **iOS splash-screen coverage is incomplete** (6 hardcoded device sizes in `index.html:17-22`) and there's no Android-equivalent theming beyond `background_color`/`theme_color`. | Newer iPhone/iPad models get no matching splash image and fall back to a blank flash on launch. | Regenerate the splash set with a tool like `pwa-asset-generator` covering current device sizes. |
| **Manual, unversioned cache-busting** (`STATIC_CACHE = 'portfolio-v3'` must be hand-bumped every deploy that touches cached assets). | A deploy that forgets the bump serves stale JS/CSS indefinitely to already-installed users — a silent, hard-to-diagnose bug class. | Move to a content-hash-based cache name (e.g., derived from the Vite build hash) so it's automatic. |

---

## 6. Self-Hosted Architecture Findings

### Security (highest priority — see Top 10 #1–3)

- **Auth-bypass-by-default with no warning**: if neither `AUTH_PIN_HASH` nor `AUTH_PIN` is set, `verify_pin_async` returns `True` unconditionally and `require_auth` short-circuits (`auth.py:80-85, 119-123`) — the entire API, including CSV import and full data reset, is open. The README's own documented Step 1 ("leave `AUTH_PIN_HASH` blank... it'll open without a login for now," `README.md:58-59`) walks operators directly into this. **Fix:** log a loud, repeated startup warning (or refuse non-localhost binds) whenever auth is unset.
- **`JWT_SECRET` example value (`change-me-to-a-random-string`) doesn't read as an obvious placeholder** the way `$2b$12$REPLACE_WITH_YOUR_HASH` does — an operator who copies `.env.example` to `.env` without editing every line could ship a publicly-known signing secret straight from this repo. **Fix:** generate a random secret on first boot if unset, rather than shipping any static example value.
- **`docker-compose.yml:15` passes `JWT_SECRET=${JWT_SECRET}` through unconditionally** — if the `.env`/shell doesn't define it, the container receives an explicitly-set empty string, which bypasses `auth.py:21`'s `os.getenv(..., "dev-secret-change-me")` fallback (empty string is not "unset" to `os.getenv`). **Fix:** validate `JWT_SECRET` is non-empty at startup and fail loudly if not.
- **WebAuthn cannot function on the one documented deployment path.** README's target is `http://<NAS-IP>:8000` (plain HTTP), but WebAuthn requires a secure context — browsers reject it before the app's own origin check runs. Combined with `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN`/`VAPID_*` being undocumented in `.env.example` and not passed through in `docker-compose.yml` at all, passkeys and push are both effectively non-functional out of the box.
- **FK cascade is inert**: `account_targets` declares `ON DELETE CASCADE` (`database.py:76`), but no connection ever runs `PRAGMA foreign_keys=ON`, and `delete_account` (`main.py:412-428`) only guards against orphaned holdings, not `account_targets` rows — deleting an account leaves orphaned target rows indefinitely.
- **Single-credential WebAuthn**: registering a passkey on a second device silently deletes the first device's credential (`webauthn_routes.py:101`, unconditional `DELETE` before every `INSERT`) — no multi-device support, no credential list/naming UX.
- **Error messages leak internals**: several endpoints echo raw exception text to the client (e.g. `main.py:1077, 1090, 1144, 1163...`) — low severity single-user risk, but unnecessary surface area.
- **Unpinned dependencies** (`requirements.txt` is all `>=`) — a `docker compose build` months from now can silently pull a breaking `yfinance` release (which frequently breaks against Yahoo's undocumented API) or any other transitive change.

### Operations / self-hosting

- **No health check endpoint anywhere** and no `healthcheck:` block in `docker-compose.yml` — Portainer/Docker can't detect a wedged container (stuck scheduler job, SQLite lock) and auto-restart it.
- **No structured logging at all** — zero uses of Python's `logging` module in `backend/`; failures are either swallowed (`except Exception: pass` in `stock_service.py:33, 112, 501-502` and the migration loop `database.py:130-134`) or only surfaced as an HTTP response to whoever happened to be looking. A failed daily refresh or partially-applied migration produces **no operator-visible signal** — the dashboard just quietly shows stale or null data.
- **No automated backups.** SQLite lives in a Docker named volume with zero backup automation and zero README guidance on `sqlite3 .backup` or volume snapshotting. Total, unrecoverable data loss on volume corruption or accidental `docker volume rm`.
- **No reverse-proxy / TLS / security-headers guidance** — README instructs exposing port 8000 directly; no Caddy/Nginx/Traefik example, no HSTS/CSP/X-Frame-Options middleware. This is also *why* WebAuthn can't work (see above).
- **Update process has no schema-version tracking or rollback** — the `migrations` list in `database.py` is append-only, order-dependent, and a genuinely failing migration is silently swallowed by the blanket `except Exception: pass`, leaving the DB partially migrated with no error.
- **APScheduler has no failure listener** — if `refresh_all_prices` throws, there's no `scheduler.add_listener(..., EVENT_JOB_ERROR)`, and since logging isn't configured anywhere, the failure is invisible end-to-end.
- **`backend/seed_401k.py` is a checked-in personal-data seeding script** with hardcoded balances (lines 11-38), not gated behind a safety flag, not part of any documented flow — operational clutter that could be run against a live DB by accident.
- **README mixes three inconsistent deployment narratives** (plain `docker compose up`, Portainer stack, "deploy without a PIN then generate hash via container exec console") with no single canonical current procedure — the "no PIN" path in particular has no follow-through guarantee an operator completes step 2/3.

### Data & API design

- **Inconsistent response shapes** across endpoints (`list_accounts`/`list_alerts` return bare arrays; `list_holdings` returns an enveloped object with `total_value`; `get_dividend_history` returns `{months: [...]}`) — no consistent envelope or pagination convention.
- **No pagination anywhere** — holdings, alerts, price history, and dividend history all return unbounded result sets.
- **No CSV upload size limit** on `/api/import/fidelity-csv` — the whole file is buffered in memory (`main.py:962`).
- **No rate limiting beyond `/auth/login` and `/auth/change-pin`** — every market-data endpoint is uncapped once authenticated, risking Yahoo/CoinGecko IP throttling from a buggy polling loop or a leaked token.
- **In-memory rate limiter is per-process and IP-keyed** (`auth.py:31`) — resets on restart, and would collapse to one shared bucket if a reverse proxy is ever added in front (not currently documented but a natural next step given the TLS gap above).

---

## 7. Performance Findings

| Finding | Estimated user impact | Suggested fix |
|---|---|---|
| **No code-splitting anywhere** — `App.jsx` statically imports `Login`/`Dashboard`/`Settings`; `Dashboard.jsx` statically imports all 7 tabs plus `CryptoView` up front, including the sizable Options/Bonds/Technicals tabs with embedded Black-Scholes/bond math and heavy `recharts` usage. | **High.** Every session pays the download/parse cost of every tab's code and the full `recharts` bundle on first load, even though most sessions touch 1-2 tabs. Prior review already flagged the 1.03MB/280KB-gzip bundle warning on the Settings pass; this is the root cause. | `React.lazy` + `Suspense` per tab (mirrors the existing lazy-tab comment in `CLAUDE.md`); add manual chunking in `vite.config.js` for `recharts`. |
| **Serial N+1 yfinance fetches** in `get_portfolio_intelligence` and `get_portfolio_analytics` (`stock_service.py:821-823, 1448-1450`) — sequential `await get_fundamentals(ticker)` per holding instead of `asyncio.gather`, unlike the dividend-calendar functions in the same file which do it correctly. | **Medium-High.** A 15-20 holding portfolio on a cold cache serializes 15-20 network round-trips inside one request — likely several seconds of wait. | Switch to `asyncio.gather` like the dividend endpoints already do. |
| **`_fetch_prices_sync` fetches tickers one at a time** in a `for` loop via individual `yf.Ticker(t).fast_info` calls (`stock_service.py:115-130`) rather than batching via `yf.Tickers`/`yf.download`. | **Medium.** Same N+1 pattern applied to the daily scheduled refresh and every manual refresh click. | Batch the fetch. |
| **Per-ticker fetch storm on the frontend**: `TechnicalsTab.jsx:866-877` fires one `api.getTechnicals(ticker)` per unique holding ticker in a `forEach` with no batching, coalescing, or cancellation on unmount. | **Medium.** 20+ concurrent requests on tab mount for a diversified portfolio; stale responses for removed tickers can still land and update state after the fact. | Add a batched `/api/technicals?tickers=...` endpoint, or at minimum an `AbortController` per fetch cleaned up on unmount. |
| **`get_technicals` does CPU-bound pandas work directly in an `async def`** without `asyncio.to_thread` (`stock_service.py:166-317`), inconsistent with every other yfinance-touching function in the file. | **Low today** (small datasets), but blocks the single event loop for the duration and will degrade as data volume grows. | Wrap in `asyncio.to_thread` for consistency. |
| **No caching of expensive derived analytics** (`/api/portfolio-analytics`, `/api/portfolio-intelligence`, `/api/rebalance-suggestions`) — the underlying yfinance calls are cached, but the aggregation/VaR/HHI/factor-analysis math re-runs from scratch every request even though holdings rarely change between requests. | **Low-Medium.** | Add a short-TTL cache keyed on a holdings-set hash. |
| **In-memory caches are unbounded and vanish on restart** (news, fundamentals, bond metrics, dividend calendar/history/yearly — all plain module dicts). | **Medium** over long uptime (unbounded growth) and **High** right after every restart (full cold-cache latency repeats). | Consider a small persistent cache layer (SQLite table or on-disk shelve) for the 24h-TTL entries at minimum. |
| **No virtualization** on any list-heavy view (Allocation table/cards, Technicals ticker row, ManageHoldings lists). | **Low today** (typical personal portfolios are tens of holdings), **High** for anyone importing a large 401k CSV with hundreds of line items. | `react-window` on the Allocation table/list once holdings exceed ~50. |
| **No `React.memo` usage anywhere** (0 matches vs. 123 `useMemo`/`useCallback` hits) — `Stat`, `HoldingCard`, `StatCard` etc. re-render on every parent poll cycle regardless of prop changes. | **Low** in practice given React 19's reconciliation, but compounds with the inline-style-object pattern used throughout. | Memoize the small, frequently-re-rendered leaf components (`Stat`, `HoldingCard`). |
| **`Dashboard.jsx` does a full 3-source refetch on every settings-save**, even when only settings (not holdings/accounts) changed (`Dashboard.jsx:121-125`). | **Low.** | Make the `settings-updated` handler refetch only settings. |

---

## 8. Accessibility Findings

| Finding | WCAG-relevant issue | Fix |
|---|---|---|
| No `eslint-plugin-jsx-a11y` in `eslint.config.js` — a11y correctness relies entirely on manual discipline, and the inconsistency below is the direct result. | No automated guardrail | Add the plugin; treat its ruleset as a checklist for the items below. |
| Interactive `<div>`/`<span>` with `onClick` and no keyboard support: `PortfolioAnalytics.jsx`'s `Breadcrumb` (lines 68-92) and `SectorsSubTab` (stacked-bar segments and sector rows, lines 106-158). | 2.1.1 Keyboard | Add `role="button" tabIndex={0}` + `onKeyDown` Enter/Space handling — `HoldingCard.jsx:24-38` already does this correctly elsewhere in the same codebase; copy the pattern. |
| Range sliders (`SliderParam` in `OptionsTab.jsx:740-763`, `BondsTab.jsx:176-198`) show a visual label but never associate it via `<label htmlFor>`/`id` or `aria-label`. | 4.1.2 Name, Role, Value | Add `aria-label` (or wire up `htmlFor`) to every slider — 6+ per tab currently announce with no name at all. |
| Sub-tab pill bars (Performance, Technicals, Bonds, PortfolioAnalytics) render as flat `<button>` rows with no `role="tablist"`/`role="tab"`/`aria-selected`. | 4.1.2 | Same shared `SubTabBar` fix recommended in §4 — bundle the ARIA fix into that refactor. |
| Global `user-select: none` on `<body>` (`index.html:26`) blocks copying displayed values (prices, gain/loss, totals) except inside inputs. | Usability / can interfere with some AT "read selection" flows | Remove the blanket rule; scope `user-select: none` only to elements that specifically need drag-safety (e.g., swipe-nav containers). |
| `C.textDim` contrast failure (≈2.9:1) — see §3, repeated here because it's fundamentally an accessibility bug, not just a polish note. | 1.4.3 Contrast (Minimum) | See §3 fix. |
| Thin `aria-label` coverage relative to interactive surface area (35 occurrences across 46 files) — icon-only/ambiguous buttons in crypto/technicals ticker chips and comparison-table toggles have no accessible name. | 4.1.2 | Audit icon-only buttons; add `aria-label` to each. |
| Focus-trap inconsistency across similarly-styled modals: `useFocusTrap` is used correctly in `ManageHoldings` but not in `AccountFilterSheet.jsx` (`role="dialog" aria-modal="true"`) or the Dividend Calendar modal. | 2.4.3 Focus Order | Apply `useFocusTrap` uniformly to every `role="dialog"` surface. |
| `srOnly` gain/loss announcements (a good pattern — prefixes "gain"/"loss" before the raw percentage) are applied inconsistently: present in `Dashboard.jsx:318`, `AllocationTab.jsx:208-209`, `HoldingCard.jsx:59`, but absent from `PortfolioPerformanceChart`'s header percentage and the Technicals position card. | 1.3.1 Info and Relationships | Extend the existing `shared.js:87-94` pattern to the remaining colored gain/loss figures — this is a "finish the job" fix, not a new pattern. |
| **Genuine strengths worth preserving**: 44px minimum touch targets applied broadly and correctly; consistent `:focus-visible` styling (`index.html:34-35`); `prefers-reduced-motion` respected via `useReducedMotion.js` in multiple components. | — | Keep enforcing these in review as new components are added. |

---

## 9. Feature Recommendations

### 9.1 What's actually implemented (feature discovery)

Recent commits (last ~15) show sustained, real feature velocity: multi-brokerage/named-account support, an interactive drill-down dividend calendar with estimated payment dates, default-to-brokerage account filtering, an Options Strategy Simulator with Black-Scholes P&L diagrams, a redesigned Technicals tab plus a new Bonds tab, Web Push wiring, a full Settings overhaul (PIN/biometric/push/export/import/reset), sub-tabbed Performance & Income view with dividend analytics, 401k manual-fund support with benchmark-proxy pricing, asset-class tracking, rebalance suggestions, and Fidelity CSV import. This is a mature, opinionated personal-finance tool, not a toy.

### 9.2 Unfinished / partially-implemented functionality

- **WebAuthn** — fully coded (register/verify/delete/status) but non-functional on the documented deployment path (see §6). Either finish the deployment story (TLS via reverse proxy) or clearly gate the feature behind an origin check with a helpful message instead of a silent failure.
- **Push notifications** — implemented and wired to the alert engine, but the opt-in re-prompt story is a dead end after one dismissal (§5).
- **PWA offline mode** — implemented for exactly 2 of ~20 GET endpoints; the rest silently fail offline with no unified messaging (§5).
- **`account_targets` cleanup on account deletion** — schema declares cascade delete that SQLite never enforces (§6); currently accumulates orphaned rows.
- **Deployment documentation** — three different, partially-contradictory narratives in README with no single source of truth (§6).

### 9.3 Missing features relative to the app's own purpose

- **No net-worth-over-time / historical snapshot chart.** Every metric (drift, HHI, performance) is point-in-time; there's no `holdings_snapshots` table or trend view, so a user can't see "how has my portfolio composition changed over the last 6 months" — arguably the single most requested feature in any portfolio tracker.
- **No watchlist** — tracking a ticker you don't yet hold (to decide whether to buy) isn't supported; everything requires adding a real holding.
- **No tax-lot tracking or tax-loss-harvesting suggestions** — cost basis is tracked per holding but not per-lot, and there's no capital-gains/loss awareness anywhere in the rebalance planner.
- **No calendar-based alerts beyond price/drift** — no earnings-date or ex-dividend-date push alerts, despite the dividend calendar already computing exactly that data.
- **No multi-broker CSV/API ingestion beyond Fidelity** — Schwab, Vanguard, Robinhood, and Plaid-style aggregation are all absent; the CSV importer is single-format.
- **No scheduled/automated exports** (e.g., a monthly emailed or pushed portfolio snapshot) despite the manual export already existing.
- **No global search / command palette** — with 7+ tabs and growing sub-tab nesting, there's no fast way to jump to "AAPL technicals" or "Settings → Notifications" without manual navigation.
- **No light theme.** Single dark palette only (confirmed — `theme.js` defines no light tokens, Settings has no toggle).

### 9.4 Automation opportunities

- **Automated, scheduled SQLite backups** (to a second volume, or optionally an S3-compatible target) — directly closes the §6 data-loss gap.
- **Digest notifications** — a weekly/monthly push or email summary ("portfolio +2.3% this week, AAPL crossed your alert threshold 3x") rather than only real-time triggered alerts, reducing the need to open the app to stay informed.
- **Auto-flag stale/broken tickers** — when yfinance repeatedly fails for a holding, surface a "this ticker hasn't updated in N days" banner instead of silently showing a stale price forever.
- **Scheduled/watch-folder CSV import** — for users who export from their broker regularly, watching a folder or accepting an email attachment would remove the manual upload step.

### 9.5 Forms & data entry

- Ticker entry has no autocomplete/search-by-name (§4) — highest-leverage forms fix, since it touches both "Add Holding" and any future watchlist feature.
- No bulk edit/delete (§4) — second highest-leverage, given rebalancing strategy changes naturally touch many holdings at once.
- Options/Bonds sliders lack paired numeric inputs (§4) — precision matters in a financial calculator.
- CSV import (per the prior Settings review) already has solid per-row error reporting — a genuine strength to preserve as other import paths are added.
- No validation bounds on Settings' target-allocation/drift-threshold/contribution-rate fields at the API layer (carried over from the 2026-04-11 Settings review's §5.3 finding, still open) — targets that don't sum to 100%, negative rates, or >100% drift thresholds are all silently accepted server-side.

### 9.6 Navigation audit

- No sidebar concept at all — desktop is effectively a scaled-up version of the mobile bottom-tab layout, with no dedicated desktop navigation pattern despite claimed desktop responsiveness. A left-rail nav on wide viewports (following Linear/Notion's pattern) would use screen real estate far better than a bottom bar squeezed to the top of a 1440px-wide window.
- No breadcrumbs anywhere except the 3-level Portfolio Analytics drill-down.
- No saved views, favorites, or pinned tickers.
- No keyboard shortcuts at all (no `Cmd+K`, no tab-number shortcuts, nothing) — a real gap against the competitive set named below.
- No sort/filter persistence — reopening a tab resets any sort/filter the user had set.

### 9.7 Dashboard evaluation

The Overview tab leads with allocation + top movers + drift, which is the right instinct (most important information first). Gaps: no historical trend context anywhere on the primary view (a single sparkline of portfolio value over 30/90 days would go a long way), and the triggered-alerts banner competes visually with the push-opt-in banner (§3) rather than clearly outranking it. The tab depth (Overview/Allocation/Performance/Projection/Technicals/Options/Bonds + Crypto) is arguably *too* granular for a landing experience — consider whether Options/Bonds, which are closer to calculators than dashboards, belong in a separate "Tools" area rather than sitting as peers to Overview/Allocation in the primary tab bar.

### 9.8 Competitive analysis

Measured against the named comparison set:

- **Linear/Notion** — both lean hard on command-palette navigation (`Cmd+K`) and instant, keyboard-first workflows. This app has neither; every action is tap/click-to-navigate. Given the data density here (dozens of tickers, 7+ tabs), a command palette (`Cmd+K` → "AAPL technicals", "Add holding", "Settings") would be disproportionately high-value for the investment required.
- **Home Assistant** — the self-hosted gold standard for exactly this deployment model (Docker, NAS, single-binary-feeling app). Its strengths this app should borrow: a prominent in-app "Settings → System → Logs" viewer, an update-notification banner sourced from GitHub releases, and a backup/restore UI built into Settings rather than left to the operator's shell. All three map directly to gaps in §6.
- **Immich/Jellyfin/Plex** — all three treat "installability + native app feel" as core, not incidental, and all ship robust offline/degraded-network handling. This app's PWA is further along than a typical side project (real manifest, real SW, real push) but its offline coverage (§5) is a fraction of what these apps guarantee.
- **Overseerr** — a good reference for this app's actual scale (single-purpose, single/few-user self-hosted tool) — notably, Overseerr's settings/health page surfaces service connectivity status (is the backend reachable, is the external API up) prominently. This app has no analogous "is yfinance/CoinGecko currently reachable" indicator; when yfinance quietly fails, nothing tells the user why prices look stale.
- **Obsidian** — plugin/extensibility model is out of scope here, but its local-first, "your data never leaves your machine" positioning is something this app already delivers (SQLite, self-hosted) and could market more explicitly in its own README/About page as a differentiator.

---

## 10. Innovation Ideas

Ten ideas intended to move this from "personal tool that works" to "the app I'd actually pay for":

1. **Net-worth timeline** — a `holdings_snapshots` table populated by the existing daily refresh job, surfaced as a simple line chart on Overview. This single feature closes the biggest gap named in §9.3 and reuses infrastructure (APScheduler) that already exists.
2. **Command palette (`Cmd+K` / long-press on mobile)** — jump to any ticker's technicals, any settings page, or trigger "Add Holding" without navigating tab-by-tab. High leverage given the app's navigation depth (§9.6).
3. **"What changed since you last looked" digest** — on login, a one-line summary card ("Since your last visit 3 days ago: portfolio +1.8%, 2 alerts triggered, AAPL crossed golden cross") using data the app already computes.
4. **Ticker autocomplete with company-name search** — small, contained, immediately useful (§4, §9.5).
5. **A real "System" panel in Settings** — reachable connectivity status for yfinance/CoinGecko, last successful refresh timestamp, last backup timestamp, DB size — directly answers the Overseerr-style gap in §9.8 and gives the operator confidence the self-hosted instance is healthy.
6. **One-click "Archive and Reset"** instead of the current destructive "Reset All Data" — auto-export a timestamped JSON snapshot to the data volume before truncating (closes the institutional-gap finding from the 2026-04-11 Settings review, §5.5, cheaply).
7. **Home-screen widgets via a lightweight companion — or, short of that, richer `manifest.json` shortcuts** (Add Holding, Refresh, Crypto) so the installed PWA feels more native from the icon long-press alone (§5).
8. **Dividend/earnings calendar push digest** — the data already exists (`get_dividend_calendar`); surface it as a proactive "3 dividends land this week, totaling $42" push rather than requiring the user to open the Dividends tab.
9. **Correlation & sector-tilt-vs-benchmark view** — named as a trader-perspective gap in the 2026-04-12 Allocation review; a single new card comparing sector weights to SPY would meaningfully raise the app's analytical credibility against Bloomberg/Fidelity-grade tools.
10. **Light theme + system-preference detection** — a contained, high-visibility polish item (`prefers-color-scheme` already respected for reduced-motion elsewhere in the codebase, so the pattern for reading system preferences already exists) that closes a real gap against every named competitor.

---

## 11. Prioritized Recommendations Summary

Consolidated view of the highest-value items above (see full write-ups in their sections for file:line citations).

| Title | Priority | Type | Complexity | Value |
|---|---|---|---|---|
| Fail loud / refuse insecure boot when no PIN set | Critical Bug | Security | Small | High |
| Fix `JWT_SECRET` weak-default + empty-string-from-Docker | Critical Bug | Security | Small | High |
| Fix WebAuthn/reverse-proxy deployment story | High Priority | PWA/Security | Medium | High |
| Add health check + structured logging + scheduler failure listener | High Priority | Architecture | Medium | High |
| Fix `C.textDim` contrast token | High Priority | Accessibility | Small | High |
| Code-split tabs + lazy-load recharts | High Priority | Performance | Medium | High |
| Extend PWA offline coverage beyond 2 endpoints | High Priority | PWA | Medium | Medium |
| Automated SQLite backups + restore docs | High Priority | Architecture | Small | High |
| Parallelize N+1 yfinance fetch loops | Medium Priority | Performance | Small | Medium |
| Standardize destructive-action confirm pattern | Medium Priority | UX | Small | Medium |
| Fix undefined `bgCard` token in Settings | Medium Priority | UI | Small | Low |
| Make interactive divs (Breadcrumb, SectorsSubTab) keyboard-accessible | Medium Priority | Accessibility | Small | Medium |
| Add ARIA to sub-tab pill bars (shared component) | Medium Priority | Accessibility/UX | Medium | Medium |
| Ticker autocomplete on Add Holding | Medium Priority | UX/Feature | Medium | High |
| Net-worth-over-time chart | Medium Priority | Feature | Medium | High |
| Bulk edit/delete holdings | Medium Priority | UX/Forms | Medium | Medium |
| Command palette | Nice-to-Have | UX/Feature | Large | High |
| Light theme | Nice-to-Have | UI | Medium | Medium |
| Manifest `shortcuts`/`screenshots` | Nice-to-Have | PWA | Small | Low |
| Sector-vs-benchmark / correlation view | Future Enhancement | Feature | Large | Medium |
| Multi-broker CSV/API ingestion | Future Enhancement | Feature | Large | High |
| Tax-lot tracking / harvesting suggestions | Future Enhancement | Feature | Large | Medium |

---

*Generated as a recurring whole-app audit. Related prior reviews: `docs/beta-review-settings-2026-04-11.md`, `docs/allocation-review-2026-04-12.md`. This pass is findings-only — no code changes were made in this session; all items above are recommendations for a future implementation pass.*
