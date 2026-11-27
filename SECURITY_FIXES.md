# Security & robustness fixes (applied on top of 1.0.35)

> Historical fix log. Current source status (2026-11-27): parental filtering cannot be enabled without an app-lock PIN; the old signed 1.0.33 manifest is archived under `docs/archive/`; release signing targets the generated `dist/latest.yml`. Parental filtering remains a local convenience feature, not an OS security boundary.

| # | Fix | Files |
|---|-----|-------|
| 1 | Signed manifest is now **bound** to the update electron-updater downloads (version, filename, sha512, size), must be strictly newer (anti-rollback), supports signed `validUntil` expiry | `manifest-verify.js`, `main.js`, `scripts/sign-update-manifest.js` |
| 2 | New `net-guard.js`: connected-address validation (no DNS-rebinding window), per-hop redirect validation, full IPv6 handling (NAT64, 6to4, ULA, link-local, mapped), streaming size caps incl. decompression | `net-guard.js`, `main.js` |
| 3 | Downloads: redirects validated for public origins; `ffmpeg` restricted by `-protocol_whitelist` (no `file:`/`concat:`); header key/value CRLF sanitised | `downloads.js` |
| 4 | Recording: scheme-specific protocol whitelist; **headers now joined with CRLF** (multi-header bug); timeouts | `main.js` |
| 5 | CSP: `object-src/base-uri/form-action/frame-src` locked down | `index.html` |
| 6 | Backup import: source/EPG ids validated; `cachePath()` can no longer escape the cache dir (path traversal via crafted backup) | `store.js`, `main.js` |
| 7 | EPG: gzip-bomb cap, streaming-capped fetch, invalid numeric entities no longer abort parsing, local EPG/playlist paths limited to expected extensions | `main.js`, `epg.js` |
| 8 | `settings:patch`: derived secrets (lock hash/salt, install id) cannot be set directly; endpoint URL and download/recording dirs validated | `main.js` |
| 9 | `js-yaml` declared as a direct dependency; versions unified to 1.0.35; stale docs corrected | `package.json`, docs |
| 10 | Duplicate `assertTrustedSender` calls removed; numeric stats values coerced before HTML | `main.js`, `player.js` |

New tests: `test:net-guard`, `test:hardening`, extended `test:manifest-signature` (all in CI).

## Release signing
- The historical signed 1.0.33 manifest is archived in `docs/archive/` and is not a release input.
- Sign the generated `dist/latest.yml` for each release with the private release key, then verify it with `npm run verify:release-manifest -- dist/latest.yml`. The release workflow already performs this step and requires the matching private key secret.
- Buy an Authenticode certificate, then set `verifyUpdateCodeSignature: true`.

## PRO additions that touch security
- `settings:patch` can no longer write `proParental` / `proHideDead` (only `pro:*` channels, PIN-protected).
- Scheduled recordings and health probes reuse `net-guard` and the scheme-specific ffmpeg whitelist; schedule URLs are validated with `assertSafeUrl`.
- Exported M3U files may contain provider credentials in URLs — the UI warns about this.
- Parental controls are a convenience filter, **not** a security boundary against someone with file access to the user's data folder.

## Verification added in 2.0.0 (real runtime, not only unit tests)
- `npm run smoke` (real Electron under Xvfb): fixed a stray `}` in the built-in harness that silently skipped most checks since 1.0.x; harness now also exercises the PRO IPC layer and fails on any `FAIL`/`EX:` marker.
- `npm run test:media`: real ffmpeg + `Downloads` against local servers — redirect, gzip, Range resume, HLS download, CRLF headers, header-injection, hostile `file:` playlist, recording args.
- `tools/ui-smoke.js` (Playwright): PRO page, failover, XSS probe.
- Note: the `ffmpeg-static` 7.0.2 build segfaults when demuxing MPEG-TS in some sandboxed VMs; `test:media` auto-selects a working ffmpeg or skips.
- `tools/ui-multiview.js` (Playwright + real media): Multiview tiles play native WebM and hls.js streams, audio follows the active tile, failed tile fails over to a backup, layouts keep channels, Esc/close releases every `<video>`, channel names are rendered as text only (XSS probe), RTL/Arabic. Found and fixed two bugs: `[hidden]` overridden by CSS (failure overlay covered tiles) and channels dropped when shrinking layouts.
