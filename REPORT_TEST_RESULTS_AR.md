# تقرير نتائج اختبار الإصدار 2.0.5

**النطاق:** Windows x64 · **تاريخ المراجعة:** 2026-11-28 · **النسخة:** 2.0.5

هذا التقرير مُولَّد آلياً من `docs/test-results.json` و`release.json`؛ أي إصدار جديد يُعيد توليده ويُؤرشف هذا الملف تلقائياً.

## النتائج

| الاختبار | النتيجة | المدة |
|---|---|---|
| test:ssrf | PASS | 501 ms |
| test:classification | PASS | 428 ms |
| test:secrets:audit | PASS | 426 ms |
| test:backup | PASS | 427 ms |
| test:update-guard | PASS | 418 ms |
| test:manifest-signature | PASS | 455 ms |
| test:epg-stream | PASS | 432 ms |
| test:classification-parity | PASS | 414 ms |
| test:net-guard | PASS | 463 ms |
| test:hardening | PASS | 1090 ms |
| test:pro | PASS | 1691 ms |
| test:pro-ipc | PASS | 781 ms |
| test:media | PASS | 1772 ms |
| test:player-engine | PASS | 424 ms |
| test:multiview-overlay | PASS | 418 ms |
| test:bugfix | PASS | 425 ms |
| test:secrets | PASS | 602 ms |
| test:ui | PASS | 21097 ms |
| smoke | PASS | 17802 ms |
| test:navigation | PASS | 4012 ms |
| test:scheduled-recording | PASS | 48497 ms |
| test:sidebar | PASS | 1609 ms |

**النتيجة الإجمالية:** 22/22 PASS، و0 FAIL.

## البناء والأصول

- GomizPlayer-PRO-IPTV-Setup-2.0.5.exe
- GomizPlayer-PRO-IPTV-Portable-2.0.5.exe
- GomizPlayer-PRO-IPTV-Setup-2.0.5.exe.blockmap
- latest.yml (موقّع Ed25519 من CI)

## النشر

- سير CI: https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/46144557795
- الإصدار: https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.5

## حدود التغطية

- لم يُختبر بث مزوّد IPTV فعلي؛ لا يُدّعى دعم DRM.
- ملفات Windows غير موقّعة Authenticode.
- بيان `dist/latest.yml` المحلي غير موقّع؛ البيان الموقّع يُنتَج في GitHub Actions.

---

# Version 2.0.5 Test Results (English)

Generated from `docs/test-results.json` and `release.json`. Reviewed 2026-11-28.

| Test | Result | Duration |
|---|---|---|
| test:ssrf | PASS | 501 ms |
| test:classification | PASS | 428 ms |
| test:secrets:audit | PASS | 426 ms |
| test:backup | PASS | 427 ms |
| test:update-guard | PASS | 418 ms |
| test:manifest-signature | PASS | 455 ms |
| test:epg-stream | PASS | 432 ms |
| test:classification-parity | PASS | 414 ms |
| test:net-guard | PASS | 463 ms |
| test:hardening | PASS | 1090 ms |
| test:pro | PASS | 1691 ms |
| test:pro-ipc | PASS | 781 ms |
| test:media | PASS | 1772 ms |
| test:player-engine | PASS | 424 ms |
| test:multiview-overlay | PASS | 418 ms |
| test:bugfix | PASS | 425 ms |
| test:secrets | PASS | 602 ms |
| test:ui | PASS | 21097 ms |
| smoke | PASS | 17802 ms |
| test:navigation | PASS | 4012 ms |
| test:scheduled-recording | PASS | 48497 ms |
| test:sidebar | PASS | 1609 ms |

**Total:** 22/22 PASS, 0 FAIL.

### Assets

- GomizPlayer-PRO-IPTV-Setup-2.0.5.exe
- GomizPlayer-PRO-IPTV-Portable-2.0.5.exe
- GomizPlayer-PRO-IPTV-Setup-2.0.5.exe.blockmap
- latest.yml (CI Ed25519-signed)

No real IPTV provider or DRM support tested. Windows binaries are not Authenticode-signed.
