# GomizPlayer PRO IPTV â€” Ø§Ù„Ø¯Ù„ÙŠÙ„ Ø§Ù„ØªÙ‚Ù†ÙŠ | Technical Guide

**Ø§Ù„Ø¥ØµØ¯Ø§Ø± Ø§Ù„Ù…ÙˆØµÙˆÙ / Version described:** 2.0.3 Â· **Ø¢Ø®Ø± Ù…Ø±Ø§Ø¬Ø¹Ø© / Reviewed:** 2026-11-27
ÙÙŠ PowerShell Ø§Ø³ØªØ®Ø¯Ù… `npm.cmd` Ø¥Ø°Ø§ ÙƒØ§Ù† ØªØ´ØºÙŠÙ„ Ù…Ù„ÙØ§Øª `npm.ps1` Ù…Ù…Ù†ÙˆØ¹Ø§Ù‹ Ø¨Ø³ÙŠØ§Ø³Ø© Ø§Ù„Ù†Ø¸Ø§Ù…. / In PowerShell, use `npm.cmd` when the system execution policy blocks `npm.ps1`.
Ù…ØµØ¯Ø± Ø­Ù‚Ø§Ø¦Ù‚ Ø§Ù„Ø¥ØµØ¯Ø§Ø± Ù‡Ùˆ Ø§Ù„Ø´ÙŠÙØ±Ø© Ùˆ`package.json` ÙˆÙ†ØªØ§Ø¦Ø¬ Ø§Ù„Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ø§Ù„Ù…Ø³Ø¬Ù„Ø© ÙÙŠ [`REPORT_TEST_RESULTS_AR.md`](REPORT_TEST_RESULTS_AR.md). Ù„Ø§ ØªÙØ¹Ø¯Ù‘ Ø§Ù„Ù…ÙŠØ²Ø§Øª ØºÙŠØ± Ø§Ù„Ù…Ø®ØªØ¨Ø±Ø© ÙˆØ¹ÙˆØ¯ ØªÙˆØ§ÙÙ‚.

## Ø§Ù„Ø¹Ø±Ø¨ÙŠØ©

### Ù…Ø§ Ø§Ù„ØªØ·Ø¨ÙŠÙ‚ØŸ
Ù…Ø´ØºÙ‘Ù„ IPTV/VOD Ù„Ø³Ø·Ø­ Ù…ÙƒØªØ¨ Windows Ù…Ø¨Ù†ÙŠ Ø¨Ù€ Electron ÙˆJavaScript. ÙŠØ¯ÙŠØ± Ù…ØµØ§Ø¯Ø± Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… ÙˆÙŠØ¹Ø±Ø¶ Ø§Ù„Ø¨Ø« Ø§Ù„Ù…Ø¨Ø§Ø´Ø± ÙˆØ§Ù„Ø£ÙÙ„Ø§Ù… ÙˆØ§Ù„Ù…Ø³Ù„Ø³Ù„Ø§ØªØŒ ÙˆÙ„Ø§ ÙŠÙˆÙÙ‘Ø± Ù…Ø­ØªÙˆÙ‰ Ø£Ùˆ Ø§Ø´ØªØ±Ø§Ùƒ IPTV.

### Ø§Ù„ÙˆØ¸Ø§Ø¦Ù Ø§Ù„Ù…ÙˆØ¬ÙˆØ¯Ø©
- **Ø§Ù„Ù…ØµØ§Ø¯Ø±:** Ù‚ÙˆØ§Ø¦Ù… M3U/M3U8 ÙˆØ¨ÙŠØ§Ù†Ø§Øª Xtream ÙˆØ±Ø§Ø¨Ø· Ù…Ø¨Ø§Ø´Ø±Ø› ÙŠÙ…ÙƒÙ† Ø£Ù† ØªØªØ¶Ù…Ù† Ø§Ù„Ø¹Ù†Ø§ØµØ± Ø±Ø¤ÙˆØ³ HTTP.
- **Ø§Ù„Ù…ÙƒØªØ¨Ø©:** Live TVØŒ Ø¯Ù„ÙŠÙ„ Ø§Ù„Ø¨Ø±Ø§Ù…Ø¬ØŒ Ø§Ù„Ø£ÙÙ„Ø§Ù…ØŒ Ø§Ù„Ù…Ø³Ù„Ø³Ù„Ø§ØªØŒ Ø§Ù„Ù…ÙØ¶Ù„Ø©ØŒ Ø³Ø¬Ù„ Ø§Ù„Ù…Ø´Ø§Ù‡Ø¯Ø© ÙˆØ§Ù„Ø¨Ø­Ø«.
- **Ø§Ù„ØªØ´ØºÙŠÙ„:** HLS Ø¹Ø¨Ø± hls.jsØŒ ÙˆMPEG-TS/M2TS Ø¹Ø¨Ø± mpegts.js Ø¹Ù†Ø¯Ù…Ø§ ÙŠØ¯Ø¹Ù… runtime Ø§Ù„Ù…ØªØµÙØ­ØŒ ÙˆMPEG-DASH Ø¹Ø¨Ø± dash.jsØŒ Ø¥Ø¶Ø§ÙØ© Ø¥Ù„Ù‰ Ø§Ù„ÙˆØ³Ø§Ø¦Ø· Ø§Ù„ØªÙŠ ÙŠØ¯Ø¹Ù…Ù‡Ø§ Chromium Ø£ØµÙ„ÙŠØ§Ù‹.
- **Multiview:** Ø­ØªÙ‰ Ø³Øª Ø®Ø§Ù†Ø§Øª Ø¨Ø£Ø±Ø¨Ø¹Ø© ØªØ®Ø·ÙŠØ·Ø§ØªØŒ Ù…Ø¹ Ø§Ø®ØªÙŠØ§Ø± ØµÙˆØª Ø§Ù„Ø®Ø§Ù†Ø© Ø§Ù„Ù†Ø´Ø·Ø©ØŒ ÙˆØ­ÙØ¸ Ø§Ù„ØªØ®Ø·ÙŠØ·/Ø§Ù„Ù‚Ù†ÙˆØ§Øª ÙˆØ§Ù„ØªØ­ÙˆÙŠÙ„ Ù„Ù„Ù…ØµØ¯Ø± Ø§Ù„Ø¨Ø¯ÙŠÙ„ Ø¹Ù†Ø¯ ÙØ´Ù„ Ø§Ù„Ø¨Ø« Ø¥Ø°Ø§ ØªÙˆÙØ± Ø¨Ø¯ÙŠÙ„.
- **Ø£Ø¯ÙˆØ§Øª PRO:** ÙØ­Øµ ØµØ­Ø© Ø§Ù„Ù‚Ù†ÙˆØ§ØªØŒ Ø¥Ø®ÙØ§Ø¡ Ø§Ù„Ù‚Ù†ÙˆØ§Øª Ø§Ù„Ù…Ø¹Ø·Ù„Ø© Ø§Ø®ØªÙŠØ§Ø±ÙŠØ§Ù‹ØŒ ÙƒØ´Ù Ø§Ù„ØªÙƒØ±Ø§Ø±ØŒ Catch-up Ø§Ù„Ù…Ø¹ØªÙ…Ø¯ Ø¹Ù„Ù‰ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø²ÙˆØ¯ØŒ Ø§Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ù…Ø¬Ø¯ÙˆÙ„ØŒ Ø§Ù„Ø±Ù‚Ø§Ø¨Ø© Ø§Ù„Ø£Ø¨ÙˆÙŠØ©ØŒ ÙˆØªØµØ¯ÙŠØ± M3U.
- **Ø§Ù„ØªÙ†Ø²ÙŠÙ„ ÙˆØ§Ù„ØªØ³Ø¬ÙŠÙ„:** Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„ØªÙ†Ø²ÙŠÙ„Ø§Øª ÙˆØªØ³Ø¬ÙŠÙ„Ø§Øª Ø§Ù„Ø¨Ø« Ø¹Ø¨Ø± FFmpeg Ø¹Ù†Ø¯ ØªÙˆÙØ±Ù‡Ø› Ø§Ù„ØªÙˆØ§ÙÙ‚ Ù…ØªØ¹Ù„Ù‚ Ø¨Ø§Ù„Ø¨Ø« ÙˆØ§Ù„ØªØ±Ù…ÙŠØ² ÙˆØ§Ù„Ù…Ø²ÙˆØ¯.
- **Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª ÙˆØ§Ù„Ø¨ÙŠØ§Ù†Ø§Øª:** ÙˆØ§Ø¬Ù‡Ø© Ø¹Ø±Ø¨ÙŠØ©/Ø¥Ù†Ø¬Ù„ÙŠØ²ÙŠØ© Ù…Ø¹ RTLØŒ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª ÙˆÙ…ØµØ§Ø¯Ø± Ù…Ø­Ù„ÙŠØ©ØŒ Ù†Ø³Ø® Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© ÙˆØ§Ø³ØªØ¹Ø§Ø¯Ø©ØŒ ØªØ´Ø®ÙŠØµ ÙˆØ³Ø¬Ù„Ø§Øª Ù…Ø­Ù„ÙŠØ©. ØªÙØ®Ø²Ù‘Ù† Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¹Ø¨Ø± Electron `safeStorage` Ø­ÙŠØ« ÙŠØ¯Ø¹Ù… Ø§Ù„Ù†Ø¸Ø§Ù… Ø°Ù„Ùƒ.
- **Ø§Ù„ØµÙØ­Ø© Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©:** Ø³Ø§Ø¹Ø©ØŒ Ø·Ù‚Ø³ ÙˆØ£ÙˆÙ‚Ø§Øª ØµÙ„Ø§Ø©. Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù…ÙˆÙ‚Ø¹/Ø§Ù„Ø·Ù‚Ø³ ÙˆØ§Ù„ØµÙ„Ø§Ø© ØªØ³ØªØ®Ø¯Ù… Ø®Ø¯Ù…Ø§Øª Ø®Ø§Ø±Ø¬ÙŠØ©Ø› Ø±Ø§Ø¬Ø¹ [`PRIVACY.md`](PRIVACY.md).

### Ø§Ù„ØªØ­Ø¯ÙŠØ«Ø§Øª ÙˆØ§Ù„Ø¨Ù†Ø§Ø¡
- Ø§Ù„ØªØ­Ø¯ÙŠØ«Ø§Øª ØªØ¹ØªÙ…Ø¯ `electron-updater` ÙˆØ¨ÙŠØ§Ù† `latest.yml` Ù…ÙˆÙ‚Ø¹Ø§Ù‹ Ø¨Ù€ Ed25519Ø› ÙŠØªØ­Ù‚Ù‚ Ø§Ù„ØªØ·Ø¨ÙŠÙ‚ Ù…Ù† Ø§Ù„Ø¨ÙŠØ§Ù† ÙˆØ§Ù„Ù…Ù„Ù Ù‚Ø¨Ù„ Ø§Ù„ØªÙ†Ø²ÙŠÙ„. Ø§Ù„ØªØ±Ø§Ø¬Ø¹ Ø§Ù„Ø¢Ù…Ù† Ù…Ø±ØªØ¨Ø· Ø¨Ø­Ø§Ø±Ø³ Ø§Ù„Ø¥ØµØ¯Ø§Ø±.
- `npm run dist` ÙŠØ¨Ù†ÙŠ NSIS ÙˆPortable x64 ÙˆÙŠØ¶Ø¹ Ø§Ù„Ù†ØªØ§Ø¦Ø¬ ØªØ­Øª `dist/v<version>/`.
- Ø¥ØµØ¯Ø§Ø± 2.0.3 Ø¨ÙÙ†ÙŠ Ù…Ø­Ù„ÙŠØ§Ù‹ ÙˆØ¹Ù„Ù‰ GitHub Actions ÙˆÙ†ÙØ´Ø± [Ù„Ù„Ø¹Ø§Ù…Ø©](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.3) Ø¨Ø£ØµÙˆÙ„ Setup ÙˆPortable Ùˆblockmap Ùˆ`latest.yml` Ø§Ù„Ù…ÙˆÙ‚Ù‘Ø¹.
- `dist/latest.yml` Ø§Ù„Ù…Ø­Ù„ÙŠ ØºÙŠØ± Ù…ÙˆÙ‚Ù‘Ø¹ØŒ Ø¨ÙŠÙ†Ù…Ø§ Ø¨ÙŠØ§Ù† CI Ø§Ù„Ù…Ø±ÙÙ‚ Ø¨Ø§Ù„Ø¥ØµØ¯Ø§Ø± Ù…ÙˆÙ‚Ù‘Ø¹ ÙˆÙ…ØªØ­Ù‚Ù‚ Ù…Ù†Ù‡. Ù…Ù„ÙØ§Øª Windows Ù„Ø§ ØªØ­Ù…Ù„ ØªÙˆÙ‚ÙŠØ¹ Authenticode.

### Ø§Ù„ÙØ­ÙˆØµ Ø§Ù„Ù…Ù†ÙØ°Ø© ÙˆØ§Ù„Ø­Ø¯ÙˆØ¯
- `npm run test:ui` Ù†Ø¬Ø­ Ù…Ø­Ù„ÙŠØ§Ù‹: UI Smoke ÙˆMultiviewØŒ Ø¨Ù…Ø§ ÙÙŠÙ‡Ø§ Ø¹ÙŠÙ†Ø© HLS H.264. ÙŠÙ…ÙƒÙ† Ø§Ø®ØªÙŠØ§Ø± Chrome Ø§Ù„Ù…Ø«Ø¨Øª Ø¹Ø¨Ø± `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` Ø¹Ù†Ø¯ Ø§Ù„Ø­Ø§Ø¬Ø©.
- Ù†Ø¬Ø­Øª Ù…Ø¬Ù…ÙˆØ¹Ø§Øª regression Ø§Ù„Ø®Ù…Ø³ Ø¹Ø´Ø±Ø© ÙÙŠ Ù…Ø³Ø§Ø± Ø¥ØµØ¯Ø§Ø± GitHubØŒ ÙƒÙ…Ø§ Ù†Ø¬Ø­ Ø¨Ù†Ø§Ø¡ Ø§Ù„Ø­Ø²Ù… ÙˆØ§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† ÙˆØ¬ÙˆØ¯Ù‡Ø§.
- `npm audit`: ØµÙØ± Ø«ØºØ±Ø§Øª Ù…Ø¹Ù„Ù†Ø© Ø¨ÙŠÙ† 309 ØªØ¨Ø¹ÙŠØ§Øª ÙÙŠ Ø§Ù„ÙØ­Øµ Ø§Ù„Ù…Ø³Ø¬Ù„.
- Ù„Ù… ÙŠÙØ®ØªØ¨Ø± MPEG-DASH Ù…Ø¹ Ù…Ø²ÙˆØ¯ ÙØ¹Ù„ÙŠØŒ ÙˆÙ„Ø§ ÙŠÙØ¹Ù„Ù† Ø¯Ø¹Ù… DRM. Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ø§Ù„ÙˆØ³Ø§Ø¦Ø· Ø§Ù„Ù…Ø­Ù„ÙŠØ© Ù„Ø§ ØªØ«Ø¨Øª Ø§Ù„ØªÙˆØ§ÙÙ‚ Ù…Ø¹ ÙƒÙ„ Ù…Ø²ÙˆØ¯ÙŠ IPTV Ø£Ùˆ Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª CORS ÙˆØ§Ù„ØªØ±Ù…ÙŠØ²Ø§Øª.
- Ø§Ù„Ø±Ù‚Ø§Ø¨Ø© Ø§Ù„Ø£Ø¨ÙˆÙŠØ© Ù…Ø±Ø´Ø­ Ù…Ø­Ù„ÙŠ ÙŠØªØ·Ù„Ø¨ PIN Ø¯Ø§Ø®Ù„ Ø§Ù„ØªØ·Ø¨ÙŠÙ‚Ø› Ù„ÙŠØ³Øª Ø­Ø§Ø¬Ø² Ù†Ø¸Ø§Ù… ØªØ´ØºÙŠÙ„ Ø£Ù…Ø§Ù… Ù…Ù† ÙŠÙ…Ù„Ùƒ ÙˆØµÙˆÙ„Ø§Ù‹ Ø¥Ù„Ù‰ Ù…Ù„ÙØ§Øª Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù….
- Ù…Ù„ÙØ§Øª Windows ØºÙŠØ± Ù…ÙˆÙ‚Ø¹Ø© AuthenticodeØŒ ÙˆÙ‚Ø¯ ÙŠØ¹Ø±Ø¶ Windows ØªÙ†Ø¨ÙŠÙ‡ Ù†Ø§Ø´Ø± ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ.

### Ø¨Ù†ÙŠØ© Ù…Ø®ØªØµØ±Ø©
`src/main/` Ø¹Ù…Ù„ÙŠØ§Øª Electron ÙˆØ§Ù„ØªØ®Ø²ÙŠÙ† ÙˆIPC ÙˆØ§Ù„Ø´Ø¨ÙƒØ© ÙˆØ§Ù„Ø£Ø³Ø±Ø§Ø± ÙˆØ§Ù„ØªØ­Ø¯ÙŠØ«Ø§ØªØ› `src/renderer/` Ø§Ù„ÙˆØ§Ø¬Ù‡Ø© ÙˆØ§Ù„Ù…Ø´ØºÙ„Ø§Øª ÙˆMultiviewØ› `src/shared/` Ù…Ù†Ø·Ù‚ Ø§Ù„ØªØµÙ†ÙŠÙ Ø§Ù„Ù…Ø´ØªØ±ÙƒØ› `tools/` Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª ÙˆØ£Ø¯ÙˆØ§Øª Ø§Ù„ØªØ·ÙˆÙŠØ±Ø› `.github/workflows/` ÙØ­ÙˆØµ CI ÙˆØ¨Ù†Ø§Ø¡ Ù…Ø³ÙˆØ¯Ø© Ø§Ù„Ø¥ØµØ¯Ø§Ø±.

## English

### What the app is
A Windows desktop IPTV/VOD player built with Electron and JavaScript. It manages user-provided sources and displays live TV, movies, and series; it does not provide IPTV content or subscriptions.

### Implemented features
- **Sources:** M3U/M3U8 playlists, Xtream credentials, and direct stream URLs; playlist items may include HTTP headers.
- **Library:** Live TV, TV guide, movies, series, favorites, viewing history, and search.
- **Playback:** HLS through hls.js; MPEG-TS/M2TS through mpegts.js when supported by the browser runtime; MPEG-DASH through dash.js; and media supported natively by Chromium.
- **Multiview:** Up to six tiles across four layouts, active-tile audio selection, saved layout/channels, and failover when playback fails and an alternative is available.
- **PRO tools:** Channel health checks, optional hiding of failed channels, duplicate detection, provider-dependent catch-up, scheduled recording, parental filtering, and M3U export.
- **Downloads and recording:** Download management and stream recording through FFmpeg where available; compatibility depends on the stream, codec, and provider.
- **Settings and data:** Arabic/English UI with RTL, local sources/settings, backup and restore, local diagnostics and logs. Credentials use Electron `safeStorage` where supported by the OS.
- **Home:** Clock, weather, and prayer-time widgets. Location, weather, and prayer-time requests use external services; see [`PRIVACY.md`](PRIVACY.md).

### Updates and builds
- Updates use `electron-updater` and an Ed25519-signed `latest.yml`; the app validates the manifest and artifact before download. Safe rollback is handled by the update guard.
- `npm run dist` builds the NSIS installer and x64 portable executable under `dist/v<version>/`.
- Version 2.0.3 was built locally and by GitHub Actions and is [publicly released](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.3) with Setup, Portable, blockmap, and signed `latest.yml`.
- Local `dist/latest.yml` is unsigned, while the CI manifest attached to the release is signed and verified. Windows executables do not have Authenticode signatures.

### Verification and limits
- Local `npm run test:ui` passed both UI Smoke and Multiview, including an H.264 HLS fixture. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use installed Chrome when needed.
- All 15 release regression groups passed in GitHub Actions; package builds and artifact-presence checks passed.
- `npm audit` reported zero known vulnerabilities across 309 dependencies in the recorded scan.
- MPEG-DASH was not tested with a real provider; DRM support is not claimed. Local media tests do not establish compatibility with every IPTV provider, codec, or CORS configuration.
- Parental controls are an in-app filter requiring an app PIN, not an OS security boundary against someone with access to the user's files.
- Windows binaries are not Authenticode-signed; Windows may show an unknown-publisher warning.

### Project structure
`src/main/` contains Electron processes, storage, IPC, networking, secrets, and updates; `src/renderer/` contains UI, playback, and Multiview; `src/shared/` contains shared classification logic; `tools/` contains tests and development utilities; `.github/workflows/` contains CI and release-draft workflows.
