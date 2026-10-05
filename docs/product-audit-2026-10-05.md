# Product / UX / Architecture Audit — 2026-10-05

Scope: static review of repo at `01f9c69` (multi-brokerage support). No runtime testing; findings cite files so they can be verified. Complexity: S/M/L. Value: L/M/H.

## Executive Summary

The app is feature-rich (7 stock tabs, crypto sub-app, options simulator, bonds, dividend calendar, passkeys, push) and visually coherent. The weaknesses are not features but **operational maturity and polish**: the self-hosted deployment story is thin (no health check, no backup/restore, push keys not wired into compose, no security headers), a few security details need hardening (JWT secret fallback, static-file path handling), and the front end ships everything in one bundle with 80-ish-line-long inline-styled components that make accessibility and consistency hard to enforce (279 sub-11px font declarations, 334 uses of the `textDim` colour). UX is dense: the Overview tab shows data but does not tell the user what to *do*.

## Top 10 Highest Impact Improvements

| # | Item | Category | Type | Cx | Value |
|---|------|----------|------|----|-------|
| 1 | **CONFIRMED (reproduced against identical handler pattern: `/%2e%2e/secret.txt` returns file outside dist, unauthenticated).** Harden SPA static handler (resolve + `is_relative_to`) | Critical Bug | Security | S | H |
| 2 | Refuse to boot with empty/default `JWT_SECRET` when a PIN is set (compose passes `${JWT_SECRET}` → empty string overrides the default; code also falls back to `dev-secret-change-me`) | Critical Bug | Security | S | H |
| 3 | Add `/api/health` + Docker `HEALTHCHECK` + compose `healthcheck` | High | Architecture | S | H |
| 4 | Backup/restore: scheduled SQLite `.backup` to a volume + full JSON export/import (today only holdings CSV/JSON export, no restore) | High | Architecture | M | H |
| 5 | Wire `VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY` (and a `.env.example` entry) into `docker-compose.yml`; push silently no-ops for compose users | High | Architecture | S | H |
| 6 | Route-level code splitting (`React.lazy` per tab; recharts only on demand). No `lazy`/`manualChunks` anywhere | High | Performance | M | H |
| 7 | "Today" summary card on Overview: day change, biggest movers, triggered alerts, upcoming dividends/ex-dates, drift needing action | High | Feature/UX | M | H |
| 8 | Security headers + proper cache headers (CSP, X-Frame-Options, Referrer-Policy, `no-cache` for `index.html`/`sw.js`, immutable for `/assets`) | High | Security/PWA | S | M |
| 9 | Raise minimum text size/contrast: replace `textDim #5A5A6E` on `#0B0B0F` (~3:1) for informational text; bump 8–10px fonts | High | Accessibility | M | H |
| 10 | Replace `window.confirm` deletes with undo toasts (holdings, accounts, alerts) | Medium | UX | S | M |

## UI Findings

- **Tiny text** — 279 `fontSize: 8/9/10` occurrences (TechnicalsTab, CryptoOverview, SectorDrillDown, DriftAnalysis…). Unreadable on phones, fails comfortable-reading norms. Set a 11px floor via theme tokens (`FS.xs`).
- **Inline-style everywhere, no tokens for spacing/typography** — consistency relies on discipline; shared.js has 133 lines for 60+ components. Impact: drift in padding/radius between tabs. Add spacing/type scale tokens, or move to CSS modules/vanilla-extract incrementally.
- **Giant components** — `TechnicalsTab` (1330 lines), `BondsTab` (896), `Settings` (868), `ManageHoldings` (797, duplicates desktop+mobile forms with `add-*`/`m-add-*` ids). Split; one form component with a responsive shell.
- **Update banner covers the header** (`App.jsx`, fixed top, z 1200) and forces a full reload; prefer a non-blocking toast with "Refresh" and auto-apply on next navigation.
- **Empty/loading/error states are uneven** — only `AllocationTab` children use `ErrorBoundary`; other tabs will white-screen on a render error. Wrap each tab in Dashboard.
- **Desktop/tablet** — layout is mobile-first (bottom tab bar + sheets). Verify ≥1024px: add a persistent left rail and multi-column Overview rather than a stretched phone layout.

## UX Findings

- **No onboarding** — first boot with auth disabled and an empty DB shows an empty dashboard. Add a 3-step wizard: set PIN → add/import holdings (Fidelity CSV drop zone) → enable notifications.
- **Dense, passive Overview** — surface "what changed / what to do" (see #7). Rebalance suggestions live two levels deep in Allocation.
- **Destructive actions use `window.confirm`** (`AccountManager.jsx:87`, Settings unsaved-changes guard). Not themeable, blocked in some PWA contexts, no undo. Use sheet + undo toast.
- **Account filter defaults to `brokerage`** (commit 678be43). A returning user with only crypto/401k sees an empty page; remember last filter in `localStorage`.
- **Alerts have no account/channel nuance** — `alerts` table is ticker-only; no snooze, repeat, or % move alerts; triggered alerts are one-shot.
- **Add-holding form** — 4–7 fields with free text ticker; no autocomplete/validation-as-you-type, no "add lot" for repeated buys, no bulk paste/CSV for brokerage accounts (only Fidelity 401k import).
- **Settings** — `unsaved changes` guard is good, but changes require explicit save; auto-save toggles with undo would be faster.

## PWA Findings

- **Hashed assets cached cache-first into `STATIC_CACHE`, but cache version `portfolio-v3` is hand-bumped** (`sw.js:1`). Inject build hash/commit (`__APP_COMMIT__` already exists in vite config) so updates always roll over.
- **`STATIC_ASSETS` precaches only shell**; JS/CSS bundles are cached lazily, so a first offline launch after install may fail. Precache the Vite manifest output (vite-plugin-pwa/workbox).
- **Offline coverage is only `/api/holdings` + `/api/settings`**; every other tab shows nothing offline. Add SWR for performance/dividends/analytics and an explicit offline banner + "last synced" (`API_CACHED_AT` exists but only partly used).
- **Mutations offline are lost** — add Background Sync queue for add/edit holding and alert creation.
- **Manifest** — one PNG declared `any maskable` (should be separate icons; maskable needs safe zone). Add `id`, `shortcuts` (Add holding, Dividends, Alerts), `screenshots`, `scope`, `lang`, and `display_override`. `orientation: any` fine.
- **iOS splash** — all six media queries point to the same SVG, which iOS ignores (needs PNGs per device size).
- **Push** — handler uses a single `tag: 'portfolio-alert'` with `renotify`, so multiple alerts collapse into one. Use per-alert tags; add badge counts (Badging API); add notification types (daily digest, ex-dividend tomorrow, big drawdown). `dismiss` action is redundant.
- **Google Fonts from CDN** — breaks the offline/self-hosted privacy promise and adds a render-blocking request; self-host DM Sans / JetBrains Mono (and add `font-display: swap`).
- **`user-select: none` on body** blocks copying numbers/tickers; limit to chrome elements.

## Self-Hosted Architecture Findings

- **No health check** (grep: no `/health` route, no `HEALTHCHECK`). Portainer/Uptime Kuma cannot detect hangs. Add `/api/health` (DB read + scheduler running + last refresh timestamp).
- **Backups** — SQLite in a named volume with no backup job. Add a daily `sqlite3 .backup` (or `VACUUM INTO`) rotation to `/app/data/backups`, a `POST /api/admin/backup` + download, and a documented restore procedure. Include a restore/import endpoint paired with `/api/export` (currently export-only, holdings only — alerts, accounts, targets, settings are excluded).
- **Compose** — `version: "3.8"` is obsolete; missing VAPID vars, `WEBAUTHN_*` origin/RP settings (check `webauthn_routes.py`), `TZ`, `PUID`; passes `AUTH_PIN` plaintext option; no `env_file`, no resource limits, no `healthcheck`, no read-only rootfs. Publish a pre-built image (GHCR via GitHub Actions) so NAS updates are `pull` not `build`.
- **Reverse proxy** — rate limiter keys on `request.client.host` (`auth.py:144`); behind Caddy/Traefik/NPM every request is the proxy IP, so 5 failures lock out everyone (or nobody if proxy is exempt). Run uvicorn with `--proxy-headers --forwarded-allow-ips` and document it. Document WebAuthn requiring HTTPS + exact origin.
- **Security headers** absent (CSP, HSTS note, nosniff, frame-ancestors, Referrer-Policy, Permissions-Policy). Add middleware.
- **JWT** — fallback secret `dev-secret-change-me`; compose substitutes `""` for unset. 72h tokens in `localStorage` (XSS-exposed); consider httpOnly SameSite cookie, refresh/rotation, and a "sign out all devices" button (pin_changed_at already enables revocation).
- **Static handler** — `FRONTEND_DIR / path` with no containment check in `serve_frontend` (`main.py` ~1335). Reproduced: encoded `%2e%2e` and `..%2f` escape the dist dir and the route is unauthenticated, so `/..%2f..%2fdata%2fportfolio.db` or `.env` is readable. Fix with `resolve()` + `is_relative_to`.
- **No structured logging / metrics** — add JSON logs, request IDs, and a Prometheus `/metrics` (protected) for refresh duration/failures, yfinance error rate.
- **yfinance dependency risk** — unofficial API breaks often. Add a provider abstraction + fallback (Stooq/Alpha Vantage/Finnhub), per-ticker last-success time, and a UI "stale price" badge.
- **Single worker / in-process scheduler** is right for SQLite; just document "do not scale workers" and set `--workers 1` explicitly. Startup also runs a full refresh on every boot (crash-loop = repeated yfinance hits).
- **Update process** — surface current version/commit (already compiled in) in Settings and a "new release available" check against GitHub releases.
- **No tests, no CI** — add GitHub Actions: `npm run lint && npm run build`, `python -m compileall`, plus pytest for the Black-Scholes, drift, and CSV parsers (pure functions, cheap to test). Add Dependabot.
- **Dependencies unpinned** (`>=`) in `requirements.txt`; use a lock (pip-tools/uv) for reproducible NAS builds.
- **Dockerfile** — good: multi-stage, non-root. Add `HEALTHCHECK`, `PYTHONUNBUFFERED=1`, `--no-cache` for pip already present.

## Performance Findings

- **Single bundle, no lazy loading** (all 7 tabs + recharts + crypto imported statically in `Dashboard.jsx`). Impact: slow cold start on mobile; est. 30–50% less initial JS with `React.lazy` + `manualChunks` for recharts. Value H, Cx M.
- **Polling** — price polls trigger child refetches (docs already fixed one case, `/api/rebalance-suggestions`); audit remaining tabs for refetch on every `data` change. Use a shared query cache (TanStack Query) with `staleTime` and request de-dup.
- **Backend** — `stock_service.py` (1954 lines) calls yfinance per request for technicals/dividends; add TTL cache (e.g. 15 min for technicals, 24h for dividends/fundamentals) persisted in SQLite so tabs open instantly after restart.
- **SQLite per-request connections** with WAL is fine at this scale; add indexes on `price_history(ticker,date)` (UNIQUE already covers) and `alerts(triggered)`.
- **Static serving** via Python `FileResponse`; fine for single user, but add gzip/brotli (`GZipMiddleware`) and `Cache-Control: immutable` for `/assets`.
- **Large lists** — holdings table renders all rows; trade journal/dividend timelines would benefit from windowing only if >200 rows (Low value today).
- **Fonts** — self-host (see PWA).

## Accessibility Findings

- **Contrast** — `textDim #5A5A6E` on `#0B0B0F`/card backgrounds ≈ 3:1, fails WCAG AA 4.5:1 for body text (334 uses). `textMuted #8E8EA0` passes. Lighten dim to ≥ `#7C7C90` or reserve for decorative text.
- **Red/green only** gain/loss encoding — add ▲/▼ glyphs and sign (+/−) everywhere for colour-blind users; check chart legends.
- **Hover-only chart tooltips** (documented in the allocation review as deferred, Low) — provide a data-table fallback or `aria-describedby` summaries for charts.
- **Touch targets** — Many 28–32px controls in `ManageHoldings` edit rows (`padding: '4px 8px'`); 44px minimum is only applied on some buttons.
- **ARIA** — present in 15 of ~60 components; tab bars, bottom sheets (focus trap, `role="dialog"`, `aria-modal`, Esc to close, return focus) and custom selects should be verified on `AccountFilterSheet`, `DividendCalendar` portal sheet, and `ManageHoldings` modal.
- **`user-select: none` + `-webkit-touch-callout: none`** hurt assistive tech and copy workflows.
- **Charts** need text alternatives (`role="img"` + summary) and `prefers-reduced-motion` handling for Recharts animations (only some components use `useReducedMotion`).
- **Forms** — `type="number"` without `inputMode="decimal"`; add `autocomplete`, `enterkeyhint`, and `aria-invalid` + `aria-describedby` error messages; Login PIN field should use `inputMode="numeric"` + `autocomplete="current-password"`.
- Positive: focus-visible ring, skip of safe-area insets, `lang` set, reduced-motion hook exists.

## Feature Recommendations

Categorised: C=Critical Bug, H=High, M=Medium, N=Nice-to-have, F=Future.

| Title | Pri | Type | Why / impact | Cx | Value |
|---|---|---|---|---|---|
| Path-traversal check in SPA handler | C | Security | Possible arbitrary file read (e.g. `.env`, DB) if encoded `..` is honoured | S | H |
| Fail-closed JWT secret | C | Security | Empty/default key = forgeable tokens | S | H |
| Health endpoint + HEALTHCHECK | H | Architecture | Lets Portainer restart hung container | S | H |
| Backup/restore (DB + full JSON) | H | Architecture | Only copy of financial history lives in one volume | M | H |
| Compose VAPID/WebAuthn env | H | Architecture | Push can't work from README deploy path | S | H |
| Code splitting | H | Performance | Faster launch | M | H |
| "Today" digest card | H | Feature | Reduces decision effort | M | H |
| Per-tab ErrorBoundary + retry | H | UX | White-screen on any render error | S | M |
| Reverse-proxy aware rate limit | H | Security | Lockout/bypass behind proxy | S | M |
| Contrast + min font size | H | Accessibility | Readability for all users | M | H |
| Undo toasts instead of `confirm()` | M | UX | Safer, faster | S | M |
| Self-host fonts | M | PWA/Perf | Offline + privacy | S | M |
| Manifest shortcuts, split maskable icon, iOS splash PNGs | M | PWA | Native feel | S | M |
| Per-alert push tags + digest/ex-div notifications | M | PWA/Feature | Alerts aren't collapsed | M | M |
| Alert enhancements (%-move, snooze, recurring, per-account) | M | Feature | Alerts currently one-shot, ticker-only | M | M |
| Broker CSV import (Schwab/Vanguard/Robinhood/IBKR generic mapper) | M | Feature | Only Fidelity 401k parser today | L | H |
| Transaction/lot history (buys/sells/dividends), realised gains, tax-lot view | M | Feature | Holdings are a single avg-cost row; no realised P&L | L | H |
| Cash/net-worth + benchmark selector, TWR/IRR/XIRR metrics | M | Feature | Performance vs S&P only | M | M |
| Price-staleness badge and provider fallback | M | Architecture | yfinance outages are invisible | M | M |
| Global search / command palette (⌘K) | M | UX | Jump to ticker/tab/action | M | M |
| Saved views (filter + tab + sort) and favourites/watchlist | N | UX | Today only a single `accountFilter` | M | M |
| Keyboard shortcuts (g o / g a, `/` search, `n` new holding) | N | UX | Desktop speed | S | L |
| Multi-user / read-only share link | F | Feature | Partner/advisor view | L | M |
| Tests + CI + Dependabot + published image | M | Architecture | No safety net on 3.3k backend lines | M | H |
| Self-update notice / changelog in Settings | N | Architecture | Update visibility | S | L |

## Innovation Ideas

1. **Morning briefing push** — one 08:30 ET notification: day P&L, top mover, ex-dividends this week, any drift > threshold, with deep-link to the relevant sheet.
2. **"What should I do?" rebalance autopilot** — compute the minimum trades to bring drift under X% using new contributions first (no sells), shown as a one-tap checklist; copy-to-broker format already exists in RebalancePlanner.
3. **Contribution planner** — "I have $500 this month": split across underweight holdings, tax-account aware.
4. **Time machine** — scrub a slider to see portfolio value/allocation on any past date; backed by `price_history`.
5. **Plain-English insights** — one-line cards ("Tech is 62% of equities; AAPL+MSFT are 31% of the portfolio") generated from existing HHI/sector data; optionally LLM-summarised weekly.
6. **Dividend income goal tracker** — target annual income, progress ring, "what to buy to close the gap", calendar sync (`.ics` feed subscribable from phone calendar).
7. **Scenario stress tests** — -20% market, rate +1%, tech -30% applied to holdings' beta/sector/duration (bond metrics already exist).
8. **Home-screen widget/Lock-screen glance** via a signed read-only `/api/glance` JSON consumed by iOS Shortcuts / Home Assistant sensor (fits the self-hosting audience).
9. **Home Assistant / MQTT / webhook integration** — publish portfolio value & alerts to HA, ntfy, Gotify, or Discord in addition to Web Push (iOS push is flaky).
10. **Privacy mode** — one tap (or shake / triple-tap on the logo) masks all dollar amounts, keeping percentages, for use in public; auto-blur when app goes to the background (app-switcher privacy).

## Competitive Notes

- **Linear/Notion**: command palette, keyboard-first, undo toasts, optimistic UI everywhere — absent here.
- **GitHub**: saved filters, notification inbox with read/unread — alerts have no history view beyond the banner; add an inbox.
- **Home Assistant/Immich/Jellyfin (self-hosted peers)**: first-run wizard, backup UI, update indicator, health/diagnostics page, API tokens, OIDC/forward-auth support — all missing. Add an "Admin → System" page (version, DB size, last refresh, provider status, backup now, download backup, logs tail).
- **Overseerr/Plex**: polished empty states with CTAs, activity feeds — empty tabs here show blank cards.
- **Obsidian**: data ownership — offer full export (JSON + SQLite) and an open, documented API with scoped API tokens.
