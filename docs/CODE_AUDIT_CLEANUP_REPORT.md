# [Historical] GomizPlayer IPTV — Code Audit & Cleanup Report (Pre-Implementation)

Date: 2026-11-17
Branch: `fix/classification-security-performance`
Scope: `src/main`, `src/renderer`, `src/shared` (vendor excluded)

> **Status: Report only. No code changes have been applied.**  
> Any implementation should be approved first (see "Implementation Prompt" at the end).
>
> Historical snapshot from 2026-11-17. It does not describe the current 2.0.2 source; re-check every finding before acting on it.

---

## 1. Method

- `node --check` on all non-vendor JS files.
- IPCs in `main.js` cross-checked against `preload.js` and `renderer` usage.
- Dead-function search (declaration count vs. reference count).
- Dead settings/state-key search vs. `store.js` DEFAULTS and renderer usage.
- Empty-catch sweep; duplicated-block sweep; require/import usage sweep.
- `docs/ERROR_AUDIT_REPORT.md` previously fixed crashers — those are "Done" and not repeated here.

---

## 2. Confirmed Dead Code (Safe to Remove)

| # | Location | Item | Referenced elsewhere |
|---|----------|------|----------------------|
| D1 | `src/renderer/player.js:15` | `fmtBytes(n)` | Never called anywhere |
| D2 | `src/shared/classification.js:10` | `hasValue(v)` | Never called inside classification.js |
| D3 | `src/renderer/app.js:116` | `isShown(id)` | Never called |
| D4 | `src/main/epg.js:67` | `byChannel(programmes)` exported via `module.exports` | Never `require`d — dead export |

## 3. Dead / Unused Settings Keys (DEFAULTS only)

| # | Location | Key | Referenced |
|---|----------|-----|------------|
| S1 | `src/main/store.js` (DEFAULTS) | `lastRoute` | Nowhere — never read |
| S2 | `src/main/store.js` (DEFAULTS) | `weatherAuto` | Nowhere — never read |

> Notes: `state.liveEntry` **is used** (recordHistory). `settings.lastRoute`/`weatherAuto` exist only as inert defaults; user profiles may still hold the keys (harmless).

---

## 4. IPC Surface — CONSISTENT (no orphans)

- **60** `ipcMain.handle(...)` channels in `main.js`.
- Every one of them is present in `preload.js`.
- Every preload `invoke(...)` has a matching handler.
- Every `window.api.*` namespace used in renderer exists in preload.
- Push channels (`update:status`, `app:prepareFactoryReset`, `downloads:changed`) are all wired.
- `sources:account` (new) is correctly chain-registered end-to-end.

**Conclusion: no dead IPC endpoints.**

---

## 5. Empty Catch Swallows

Total ~55 `catch (_) {}` across renderer+main (app.js 20, player.js 35, downloads.js 24).

- Intent: swallow non-critical errors silently.
- Risk: masks real failures (auth/decrypt/CRASH). Most are acceptable by design, but the following are worth splitting into `catch (_) { /* intentionally ignored */ }` vs `console.warn(...)`:
  - `decryptSourcePassword` paths (main.js, secrets.js) — already surfaced via `sources:refresh` error UI, OK.
  - EPG/weather/prayer fetch paths — intentional (UI shows "unavailable"), OK.
  - Downloads callbacks — OK by design.

**Recommendation: keep behavior, but tag with an explicit comment** `/* intentional: … */` in at least the weather/prayer/EPG spots; leave hot IPC error paths unchanged.

---

## 6. Duplicated Blocks (Candidates for Extraction, optional)

Repeated 2-line patterns (≥6 occurrences each):
1. `wrap.appendChild(actions); openModal(wrap);` — 7 occurrences → extract `openModalWithActions(wrap, actions)` (or `finishModal(...)`).
2. `render();` right after `patchSettings(...)` — 8 occurrences → extract `patchThenRender(...)`/`setSettingAndRender(key, value)` helper.
3. `actions.appendChild(makeButton('', { cls: 'icon-btn', icon: 'refresh' / 'edit' / 'trash' … }))` — 6+ occurrences in sources/recordings/downloads → extract listAction helpers.

> These are pure DRY refactors; no behavior change intended.

---

## 7. Repeated Classification Filters

`state.items.filter(isLiveKind/isMovieKind/isSeriesKind)` called in several places (renderHome, Home rows, drawer).

- Already mitigated via `effectiveMediaKind` returning cached `item.kind` (big win, ~250ms → 5–14ms on Home).
- Remaining duplication is stylistic; acceptable. Optional: single-pass split helper `splitKinds(items)` returning `{live, movies, series}` — would reduce 3 scans to 1 scan.

---

## 8. Untracked / Junk Artifacts (NOT in git, candidates for cleanup — requires your approval)

| Path | Size | Note |
|------|------|------|
| `recovered-app/` | ~116 MB | Duplicate snapshot of src (contains pkg/modules). **Not needed; delete after approval.** |
| `false/` | ~757 KB | Accidental directory (artifacts from earlier scripts/tests). **Delete.** |
| `tools/append-report*.js`, `tools/generate-report.js`, `tools/bench-m3u.js` | ~295 KB total (tools/) | One-off report generators used during past phases; not part of app. **Delete or move to `tools/_archive/`.** |
| `docs/*.pdf`, `docs/*.html` | 0 KB (already ignored by .gitignore? actually untracked PDFs listed) | Generated artifacts; keep or delete per your wish. |
| `dist-build.log` | — | Ignored by git (`*.log`) — harmless. |

> **Important:** `docs/ERROR_AUDIT_REPORT.md` (created during prior work) is part of the project history — keep.

---

## 9. Build / Packaging Not Affected

- `package.json` build config unchanged (Windows targets).
- `dist/` is gitignored.
- `screenshots/` is tracked but harmless (used for docs/AR previews).
- `.github/workflows/build-all.yml` added earlier for mac/linux CI — keep.

---

## 10. i18n Status

- `nav_my_vod` + `nav_favorites` renamed and aligned (en/fr/ar).
- Arabic currently carries a few **English-fallback** strings (documented previously); not a blocker.

---

## 11. What MUST NOT Be Touched (Risk Items)

1. `SMOKE_RESULT` contract (`tools/run-smoke.js`) — the test harness parses this exact string.
2. `window.__novaTest` hook — used by smoke tests; do not remove.
3. IPC channel names — changing them breaks preload/renderer pairing.
4. `store.js` schema & migration paths (`migrateSecrets`, v1→v2 password encryption).
5. `app:factoryReset` flow & `RESET` confirmation.
6. Settings merge semantics (`mergeDefaults`) — patching `null`/remove is not supported; do not try.
7. `sources:update` optional-password behavior — empty password means "keep existing".

---

## 12. Implementation Prompt (ready to execute)

> You are cleaning up the GomizPlayer IPTV Electron app. Apply ONLY the changes below. Do not modify anything else. Work on branch `fix/classification-security-performance`. Do not commit/push.
>
> **Step 1 — Remove dead code:**
> 1. In `src/renderer/player.js` delete `function fmtBytes(n) { … }` entirely.
> 2. In `src/shared/classification.js` delete `function hasValue(v) { return norm(v).length > 0; }` entirely.
> 3. In `src/renderer/app.js` delete `function isShown(id) { return !homeLayout().hidden.includes(id); }` entirely.
> 4. In `src/main/epg.js` delete `function byChannel(programmes) { … }` and remove it from `module.exports`.
>
> **Step 2 — Remove dead settings defaults:**
> 5. In `src/main/store.js` remove `lastRoute: …,` and `weatherAuto: …,` from DEFAULTS.
>
> **Step 3 — Optional DRY refactors (only if trivial and mechanical):**
> 6. Replace 7× `wrap.appendChild(actions); openModal(wrap);` with a tiny helper `openModalWithActions(wrap, actions)` (or equivalent). Keep semantics identical.
> 7. (Optional) Add single-pass `splitKinds(items)` helper used by Home; do not change output shape.
>
> **Step 4 — Clean untracked artifacts (with user approval):**
> 8. Delete `recovered-app/`, `false/`, `tools/append-report*.js`, `tools/generate-report.js`, `tools/bench-m3u.js`.
>
> **Step 5 — Verification:**
> 9. `node --check` all modified JS.
> 10. Run `npm run test:ssrf`, `npm run test:classification`, `npm test:secrets` (via node directly if npm blocked).
> 11. Run Electron smoke test; expect `SMOKE_RESULT PASS`.
> 12. Report diffs and any blocked items; do NOT build exe unless asked.

---

## 13. Estimated Impact

- ~40–60 lines of confirmed dead code removed.
- 2 inert settings defaults removed.
- ~116 MB of junk removed from working tree (if approved).
- Zero intended behavior change; zero risk to encrypted data & user library.
