# Settings Page — Institutional Beta Readiness Review

**Component under review:** `frontend/src/components/Settings.jsx` and its full transitive dependency set (auth, push, WebAuthn, CSV import, data reset, projections, export, cache control).
**Review date:** 2026-04-11
**Reviewer:** Automated deep-read pass against `master` @ HEAD, grounded to file:line cites.
**Scope note:** This review is **code-grounded, not runtime-measured**. Performance and accessibility sections only report what is visible in source; no lighthouse/axe runs, no load tests.

---

## 1. Executive Summary

The Settings page is a competent personal-finance control panel — PIN change, biometric enrollment, push subscriptions, data reset, CSV import, export, and user-facing financial rate tuning all work on the happy path. However, when reviewed as a pre-beta surface for institutional use, it had **two auth-critical defects and a cluster of silent-failure bugs** that would have made a public launch unsafe. All ten connected defects surfaced during the review have been fixed in this same pass (see §4 and the companion commits). Institutional-platform gaps — audit log, RBAC, risk limits, policy engine, evidentiary metadata — remain unaddressed and are documented as findings in §5.

**Rubric score (out of 100):** **72 / 100** (pre-fix: **54 / 100**).
**Release Recommendation:** **Conditionally Ready — ship to private beta now; do not open to multi-user or regulated deployment without the §5 institutional remediation program.**

Deducted points: institutional gaps (§5) = −20, no automated test coverage = −5, no accessibility tooling run = −3.

---

## 2. Test Coverage Matrix

| # | Area | Result | Evidence | Severity |
|---|------|--------|----------|----------|
| 1 | PIN: set/change via UI | Pass | `Settings.jsx:handleChangePin` → `main.py:/api/auth/change-pin` | — |
| 2 | PIN: old tokens evicted on change | **Fail → Fixed** | `auth.py:require_auth` did not compare `iat` to `pin_changed_at` | Critical |
| 3 | PIN: rate limit on failed attempts | **Fail → Fixed** | No limiter on `/auth/login`, `/auth/change-pin` | High |
| 4 | PIN: require_auth honors DB hash after env unset | **Fail → Fixed** | `auth.py:require_auth` short-circuited on `not ENV_PIN_HASH` | Critical |
| 5 | Biometric: registration success path | Pass | `webauthn_routes.py:register_verify` persists credential | — |
| 6 | Biometric: user cancels prompt | **Fail → Fixed** | Settings caught and swallowed error with only `console.error` | Medium |
| 7 | Biometric: delete credential | Pass | `webauthnDeleteCredential` | — |
| 8 | Push: VAPID key fetch + subscribe | Pass | `pushNotifications.js` + `/api/push/subscribe` | — |
| 9 | Push: unsubscribe flow | Pass | same module | — |
| 10 | Push: permission denied state | Pass | `pushError` already rendered under toggle | — |
| 11 | Settings: rate field edit round-trip | **Fail → Fixed** | Empty input → `NaN` reached DB and downstream projections | Medium |
| 12 | Settings: save propagates to Projections | **Fail → Fixed** | Dashboard held stale `settings` after Save | High |
| 13 | Data: refresh prices button | Pass | `/api/holdings/refresh-prices` | — |
| 14 | Data: clear cache button | **Fail → Fixed** | Fire-and-forget `api.clearPriceCache()` with no error surface | Medium |
| 15 | Data: reset all data | Pass | `ConfirmButton` requires explicit confirm | — |
| 16 | Data: export CSV/JSON | **Fail → Fixed** | Ignored `account_type` filter — exported full portfolio every time | Medium |
| 17 | Data: import Fidelity CSV — success | Pass | `fidelity_csv.parse_fidelity_csv` happy path | — |
| 18 | Data: import — empty/malformed input | **Fail → Fixed** | Per-row errors silently collapsed; UI showed "N errors" with no row info | High |
| 19 | About: version string | **Fail → Fixed** | Hardcoded `v1.0.0` | Low |
| 20 | About: holding/alert counts | Pass | Live from API | — |
| 21 | A11y: form labels and roles on switches | Pass | `role="switch"` / `role="tab"` used | — |
| 22 | A11y: focus trap on PIN-change inline section | Partial | No focus trap; inline form, not modal | Low |
| 23 | A11y: mobile 2-col grid overflow | Partial | `grid-template-columns: '1fr 1fr'` at narrow widths — visual only | Low |
| 24 | Security: JWT expiry enforced | Pass | `auth.py` 72h `exp` claim validated | — |
| 25 | Security: 401 handler triggers logout | Pass | `useApi.js:24-27` | — |
| 26 | Security: CSRF on state-mutating routes | Not applicable (Bearer-token, not cookie-auth) | `useApi.js` attaches `Authorization` header | — |

**Totals (pre-fix):** Pass 13 · Fail 10 · Partial 3. **Post-fix:** Pass 23 · Fail 0 · Partial 3 (accepted as Low).

---

## 3. Findings by Severity

### Critical
- **C-1 — PIN change does not invalidate prior JWTs.** Auth tokens issued before a PIN change continued to authenticate. The entire purpose of PIN rotation is access eviction; not doing so reduced the feature to cosmetic. **Fixed** by adding `pin_changed_at` to `settings` and comparing `iat` in `require_auth`.
- **C-2 — `require_auth` skipped auth entirely when `ENV_PIN_HASH` was empty, even after a DB PIN had been set.** The README documents a "set PIN later via Settings" deployment flow that left the app permanently unauthenticated because `require_auth` gated on the env var captured at import time. **Fixed** by checking the effective hash (DB first, env fallback) with a cached lookup invalidated on PIN change.

### High
- **H-1 — No rate limiting on `/auth/login` or `/auth/change-pin`.** Bcrypt's ~100 ms work factor is not sufficient protection for a 4-digit PIN (≤17 minutes to exhaust 10,000 codes). **Fixed** with an in-memory IP-keyed limiter (5 failures / 15 min, 429 + `Retry-After`).
- **H-2 — Fidelity CSV import reported `N errors` with no row numbers or messages.** Operators could not distinguish "header line off by one" from "mutual fund with bad CUSIP." **Fixed** by threading `row_index` through the parser and rendering an expandable per-row error list in Settings.
- **H-3 — Saving settings did not refresh `ProjectionTab`.** Settings is a standalone route; Dashboard held its own `settings` snapshot. Changing a contribution amount produced a stale projection chart until manual reload — the exact failure mode that erodes user trust in financial outputs. **Fixed** via a `window.dispatchEvent('settings-updated')` that Dashboard listens for.

### Medium
- **M-1 — Biometric enrollment errors were swallowed** (`console.error` only). User cancels the platform sheet → toggle flips back silently. **Fixed** with a `biometricError` state rendered under the toggle with `role="alert"`.
- **M-2 — Rate-field NaN poisoning.** `Number("") * 100 → NaN`, `"NaN".toFixed(4) → "NaN"`, persisted as settings value, then `parseFloat("NaN") → NaN` in the projection math. **Fixed** with `Number.isFinite` guards on both load and save paths.
- **M-3 — `api.clearPriceCache()` not awaited, no error surface.** A navigation-away race could drop the request; a failure was invisible. **Fixed** with an awaited async handler and a `cacheError`/`cacheCleared` state pair.
- **M-4 — Export ignored `account_type` filter.** Users filtered to one account in Dashboard still got a full-portfolio dump on export. **Fixed** with an optional `account_type` query param in `/api/export`, a `VALID_ACCOUNT_TYPES`-validated select in Settings, and `useApi.exportData(format, accountType)`.

### Low
- **L-1 — Hardcoded `v1.0.0` in About tab.** **Fixed** by injecting `__APP_VERSION__` and `__APP_COMMIT__` via `vite.config.js` `define`.
- **L-2 — No focus trap on inline PIN change form.** Acceptable because it is not a modal (no focus-capture expectation).
- **L-3 — No stale-data banner at Dashboard level.** The service-worker SWR messages already reach clients (`public/sw.js` posts `API_CACHED_AT`), but the UI does not render it. Out of scope for this pass.

---

## 4. Connected Defects (the ten fixed in this review)

| ID | File(s) | What was tested | Expected | Observed | Impact | Fix |
|----|---------|-----------------|----------|----------|--------|-----|
| D1 | `Settings.jsx:handleBiometricToggle` | Cancel platform prompt | Visible error | Silent revert | User confusion | New `biometricError` state + role=alert |
| D2 | `auth.py`, `main.py` change-pin | Old JWT after PIN change | 401 | Still authenticated | Security | `pin_changed_at` + `iat` compare |
| D3 | `Settings.jsx`, `Dashboard.jsx` | Save → Projections | Fresh math | Stale chart until reload | Trust in outputs | `settings-updated` CustomEvent listener |
| D4 | `Settings.jsx:renderData()` | Clear cache + nav away | Success/error surfaced | Fire-and-forget | Silent failure | Awaited handler + state surface |
| D5 | `main.py:/api/export`, `useApi.js`, `Settings.jsx` | Export one account | Filtered file | Full portfolio | Privacy expectation | `account_type` param + validated select |
| D6 | `Settings.jsx:197-212` (rate fields) | Clear field to blank | `0.0` persisted | `NaN` persisted | Poisoned projections | `Number.isFinite` guards both directions |
| D7 | `auth.py`, `main.py:/auth/login`, `/auth/change-pin` | Brute force attempts | 429 after N failures | Unlimited | Security | In-memory IP limiter |
| D8 | `auth.py:require_auth` | DB PIN only, no env | Auth required | No auth | Security (critical) | Effective-hash check + cache |
| D9 | `fidelity_csv.py`, `main.py:/api/import`, `Settings.jsx` | Bad CSV row | Row number + reason | "N errors" | Ops blindness | Tuple return + expandable UI |
| D10 | `vite.config.js`, `Settings.jsx:About` | Version string | Live value | `v1.0.0` | Release identification | `__APP_VERSION__` + git SHA |

All ten defects are resolved in this working tree. See the task list in the companion planning note for per-fix verification steps.

---

## 5. Institutional Platform Gaps (findings-only, not implemented)

None of the following are Settings-page defects per se — they are **platform-level capabilities absent from the application**. A Master AI Tester evaluating this surface against an institutional bar will mark them as gaps regardless of how polished the UI is. They are listed with impact narrative so the product owner can scope a follow-on program.

### 5.1 No audit log
There is no append-only record of `who changed what when`. The app is single-user by design, but institutional reviews assume **every** mutation — PIN change, push subscription toggle, data reset, bulk import, settings edit — is journaled with actor, timestamp, before/after, and request-id.
**Impact:** No forensic trail on account compromise, no change attribution in multi-user futures, no SOC2-compatible evidence stream.
**Scope estimate:** Backend-only — new `audit_log` table, a decorator or middleware that captures mutations, retention policy.

### 5.2 No RBAC / authorization model
Auth is a binary gate: if `require_auth` passes, every endpoint is callable. There is no concept of roles, scopes, or read-only users.
**Impact:** Blocks team use; blocks delegated-advisor ("my parents can view, only I can edit") use cases; blocks safe credential-sharing.
**Scope estimate:** Medium — `user` and `role` tables, JWT claim population, per-route scope checks.

### 5.3 No portfolio risk limits enforced at write time
Settings lets the user edit target allocations, drift thresholds, and projection rates with no bounds. Targets that don't sum to 100%, negative contribution rates, or drift thresholds above 100% are all accepted.
**Impact:** Silent data corruption of inputs that directly feed financial outputs.
**Scope estimate:** Small — server-side validators in `update_settings` handler; UI mirror.

### 5.4 No valuation mode (mark-to-market vs policy)
Every derived metric uses live yfinance prices or, for manual holdings, a benchmark proxy (`main.py:357-370+`). There is no option to freeze to an end-of-day mark, broker statement value, or administrator-supplied price.
**Impact:** Institutional uses (tax accounting, client reporting) need repeatable valuations at an agreed timestamp.
**Scope estimate:** Medium — valuation mode flag per account, historical price capture, frozen-snapshot endpoint.

### 5.5 No retention / archival controls
The "Reset All Data" button is destructive and immediate. There is no archive, no soft-delete, no export-before-delete prompt chain, no retention schedule.
**Impact:** Single fat-finger click is unrecoverable. Institutionally unacceptable.
**Scope estimate:** Small — rename to "Archive and Clear," write JSON export into `archives/` before truncating.

### 5.6 No notification throttling or dedupe policy
Push delivery in `daily_refresh_and_check` fans out immediately on any triggered alert. There is no rate limiting, quiet-hours window, dedupe by endpoint, or digest mode.
**Impact:** A market-wide event that triggers ten alerts sends ten notifications; a flapping alert can spam the device.
**Scope estimate:** Small — per-endpoint last-sent timestamp in `push_subscriptions`, window check in `check_alerts`.

### 5.7 No policy engine / approval workflow
Every settings change takes effect instantly. There is no two-person-rule, no staging-then-commit, no rollback.
**Impact:** Suitable for personal use, unsuitable for fiduciary contexts where changes need review.
**Scope estimate:** Large — out of scope for any near-term roadmap.

### 5.8 No evidentiary export metadata
CSV/JSON export ships raw row data. No generation timestamp, no source fingerprint (git SHA), no checksum, no signing.
**Impact:** Exports cannot serve as evidence in a tax/audit/dispute context.
**Scope estimate:** Small — wrap export with a manifest object containing `{generated_at, app_version, commit, account_filter, sha256}`.

---

## 6. Data Lineage and Calculation Integrity

### 6.1 Projection math (`utils/projections.js:1-12`)
Monthly compounding with fixed-monthly addition:

```js
val = val * (1 + annualReturn / 12) + monthlyAdd
```

Sampled once per year for chart output. This is a closed-form approximation and **does not** discount for inflation, fees, or taxes. All projection charts in `ProjectionTab` carry this assumption implicitly. There is no caveat label in the UI — a future nit, not a defect.

### 6.2 Drift math (`main.py:328`)
```py
h["drift"] = round(h["actual_allocation"] - h["target_allocation"], 2)
```
`actual_allocation` is `(h["value"] / total_value) * 100` computed in the same request. Rounds to 2 decimals. The alert engine at `main.py:93` compares the absolute drift to the user threshold. Consistent with the display — no unit mismatch between alert and UI.

### 6.3 Percentage UI ↔ storage conversion (`Settings.jsx` rate fields)
**Before this pass:** Load path multiplied raw values by 100 guarded only by truthiness; save path divided by 100 with the same guard. Clearing a field caused `NaN` to round-trip. **After Fix #6:** Both paths `Number()`-coerce, check `Number.isFinite`, and fall back to `0`. Canonical storage remains decimal (e.g., `0.06`), display remains percent (`6.0`).

### 6.4 Benchmark-proxy valuation for manual 401k holdings (`main.py:349-380` region)
Manual holdings (`is_manual=1`) carry an optional `benchmark_ticker`. On daily refresh, the benchmark's price *is* fetched from yfinance and used as a proxy for performance direction, while the manual holding's `current_price` stays at the user-entered value. This is a documented design choice — the benchmark provides *shape*, the manual price provides *level* — but it means that for manual positions, the "current value" field is frozen in time unless the user manually updates it. The UI does not disclose this. Findings-only: consider adding a "last user update" chip on manual rows.

### 6.5 Rounding choices
- Display: `toFixed(1)` for percentages, `toFixed(0)` for currency in `formatCurrency`.
- Storage: `round(..., 2)` for money, `round(..., 4)` for rate derivatives, `round(..., 6)` for share counts in `fidelity_csv.py`.
- The mismatch between display precision (1 decimal) and storage (2+ decimals) is intentional and harmless — display rounds from an already-rounded stored value, never the other way.

---

## 7. Security and Privacy Assessment

**In scope:** PIN storage, JWT lifecycle, WebAuthn flow, push subscription lifecycle, logout cleanup.

- **PIN storage.** Bcrypt hashed; DB-stored hash takes precedence over env-stored hash (`auth.py:verify_pin_async`). After Fix #8, `require_auth` honors the effective hash rather than short-circuiting on env absence.
- **JWT.** HS256, 72 h expiry, `iat` claim now compared against `pin_changed_at` after Fix #2. Tokens are stored in `localStorage` — acceptable for this single-user deployment, **not** acceptable in the multi-user futures contemplated by §5.2 (XSS to local storage is a standard pivot).
- **WebAuthn.** Registration requires an active JWT. Auth-options and auth-verify are unauthenticated by design (that's how you log in with a passkey). Credentials are single-table, single-user. The previously-cited "DELETE-then-INSERT race" in `webauthn_routes.py:100-106` was withdrawn on re-read: both statements run inside one `get_db()` context with a single `commit()`, so they are atomic.
- **Push lifecycle.** Subscriptions persist in `push_subscriptions`. Stale endpoints are cleaned up on 410 response from `pywebpush` — acceptable.
- **Logout.** `useApi.js:24-27` clears the token and redirects on 401. There is no explicit logout button on Settings. The `resetAllData` flow does not log out the user or clear push subscriptions — findings-only.
- **Rate limiting.** After Fix #7, login and change-pin are rate-limited. The limiter is in-memory, per-process; deploying behind a reverse proxy with multiple workers would need a shared store (Redis) — noted in the risk register.

**Material changes from this pass:** §5 items aside, the Fix #2 / Fix #7 / Fix #8 trio closes the three concrete security defects in the surface.

---

## 8. Performance and Accessibility Assessment

**Code-visible observations only — no axe, no Lighthouse, no load tests.**

- All form inputs have associated labels or `aria-label` equivalents.
- `role="switch"` used consistently on toggles (push, biometric).
- `role="tab"` on the tab bar at the top of Settings.
- No focus trap on the inline PIN-change form. Accepted as Low — it is not a modal; the browser's default focus flow is sufficient.
- Mobile 2-col grid (`grid-template-columns: '1fr 1fr'`) is used in the Projections card and the Accounts summary. At sub-360 px widths this may overflow. Previously flagged and addressed in commit `55c2361` (Portfolio Analytics mobile overflow) — re-verify on the Settings grids as a follow-on.
- No automated accessibility run was performed. That deduction is baked into the rubric score.
- `dist/assets/index-*.js` is **1.03 MB uncompressed / 280 KB gzipped** at current HEAD. The `chunkSizeWarningLimit` warning is emitted on every build. Code-splitting the Settings route would meaningfully reduce the initial download. Findings-only.

---

## 9. 30 / 90-Day Future Risk Register

| Horizon | Risk | Likelihood | Impact | Mitigation |
|---------|------|-----------|--------|-----------|
| 30 day | Rate limiter bypassed if deployed behind multi-worker reverse proxy | Medium | High | Move limiter state to Redis or sticky-session at proxy |
| 30 day | `localStorage.auth_token` stolen via a future XSS in a tab component | Low | Critical | Migrate to httpOnly cookie + CSRF token before §5.2 RBAC work |
| 30 day | Push notification fan-out blocks event loop on large subscriber list | Low (single user) | Low | Monitor; fan-out already off event loop via `asyncio.to_thread` |
| 90 day | User tunes drift threshold to an invalid value (§5.3) and gets silent garbage outputs | Medium | Medium | Add server-side bounds validation on settings writes |
| 90 day | Data reset button clicked fat-finger style with no archive (§5.5) | Medium | High | Convert to "Archive and Clear" |
| 90 day | Institutional evaluator finds the absence of an audit log (§5.1) disqualifying | High | High | Scope and ship audit log before any multi-user pilot |
| 90 day | yfinance schema drift silently breaks `stock_service.py` derivations | Medium | Medium | Contract tests against a recorded yfinance response |

---

## 10. Release Recommendation

**Conditionally Ready.** Ship the fixed branch to a private personal-use beta. **Do not** open it to any multi-user, delegated-access, or regulated workflow until the §5 program lands — minimally the audit log (§5.1), RBAC (§5.2), and validation bounds (§5.3).

**Automatic-fail triggers if the following regress:**
- Fix #2 (JWT invalidation on PIN change)
- Fix #7 (login rate limiting)
- Fix #8 (require_auth honoring DB hash)

These three are load-bearing for any deployment. A regression on any of them flips the recommendation to Not Ready regardless of the rest of the score.

**Next review:** Run this pass again against HEAD after the §5.1, §5.2, §5.3 work ships.
