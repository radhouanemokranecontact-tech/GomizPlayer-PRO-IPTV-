# تقرير الإصلاح والتحقق — GomizPlayer PRO IPTV 2.0.5

**الإصدار:** 2.0.5 · **التاريخ:** 2026-11-28 · **الحالة:** هذا هو التقرير الحالي الوحيد. تُؤرشف تقارير الإصدارات السابقة في `docs/archive/reports/` ولا تُترك في الموقع الحالي.

## ملخص

إصدار Windows x64 يوحّد التاريخ والتقارير والاختبارات مع الشيفرة، ويصلح ترميز العربية، وإدارة تركيز التنقل، وظهور التسجيل المجدول فوراً، وتوسيط شريط التنقل.

### الميزات

- مصادر M3U/M3U8 وXtream والرابط المباشر؛ بث مباشر وأفلام ومسلسلات ودليل ومفضلة وبحث وسجل.
- تشغيل HLS وMPEG-TS/M2TS وMPEG-DASH المتوافق والوسائط الأصلية.
- أدوات PRO: فحص القنوات، كشف التكرار، Catch-up، تسجيل مجدول، رقابة أبوية برمز PIN مستقل عن قفل التطبيق، وتصدير M3U.
- Multiview حتى ست قنوات بأربعة تخطيطات وصوت للخانة النشطة والتحويل إلى مصدر بديل.
- تنزيلات ونسخ احتياطية وتشخيص وواجهة عربية/إنجليزية.
- نظام إصدار موحّد: release.json هو مصدر الحقيقة للتاريخ والإصدار والاختبارات والتقارير، مع فحص CI يمنع تقارير قديمة أو ترميزاً مكسوراً.

### الإصلاحات

- ترميز العربية في PRIVACY.md وTECHNICAL_GUIDE.md وSECURITY_FIXES.md وROADMAP.md كان مكسوراً على GitHub؛ أُصلح وضُبط فحص ترميز تلقائي.
- توحيد تواريخ الإصدار وتقارير الاختبار وملفات الاختبارات مع رقم الحزمة؛ أُرشفت تقارير الإصدارات السابقة بدل تركها في الموقع الحالي.
- تنقل القنوات: تركيز ثابت، منع إعادة تفعيل أزرار التنقل بـ Enter، اختصارات PageUp/PageDown وCtrl+الأسهم، وإدارة تركيز قائمة القنوات.
- التسجيل المجدول: ظهور الملف في «التسجيلات» فور انتهائه دون إعادة تشغيل التطبيق.
- توسيط العناصر الثلاثة عشر في الشريط الجانبي مع تثبيت الشعار ومحدد اللغة.
- فصل الرقابة الأبوية عن قفل التطبيق عبر PIN مستقل داخل PRO Tools.
- إصلاح تجاوز قفل التطبيق، تلوث النموذج الأولي، استيراد نسخة احتياطية ذري، وحفظ كلمة مرور Xtream.
- إصلاح سباق التسجيل، عدّ أعطال التشغيل، مسارات التنزيل القديمة، فك ضغط EPG مرتين، وعدّ القنوات غير المعروفة.
- إصلاح إيقاف الترجمات، فهارس الترجمة الأصلية، مفتاح Escape، أولوية نوع الوسيط، نافذة الإدخال، وأيقونة المفضلة.
- إصلاح سكربت التوقيع، خطة الإصدار، اختبار الوسائط في CI، واختبار smoke.

## نتائج الاختبار (مصدر واحد: `docs/test-results.json`)

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

**المجموع:** 22/22 ناجح. وقت التوليد: 2026-11-28T12:07:12.230Z.

## النشر

- سير CI: —
- الإصدار: —

## الارتباط بالمصدر

- نسخة الحزمة: `package.json` = 2.0.5
- ملف الإصدار: `release.json`
- بصمة مجلد `src/`: `aec3ec87cd3ad5a59fb5d1d5f4f36c363a0bf605a47b8011f852850e6e7f82fa`
- حالة الإصدار وبيانات الاختبار: `docs/RELEASE_STATE.json` و`docs/test-results.json`

## English

Windows x64 release that unifies dates, reports, tests and source metadata, repairs Arabic encoding, navigation focus, immediate scheduled-recording visibility and sidebar centering.

### Features

- M3U/M3U8, Xtream and direct sources; live TV, movies, series, guide, favorites, search and history.
- HLS, MPEG-TS/M2TS, compatible MPEG-DASH and native playback.
- PRO tools: health scan, dedupe, catch-up, scheduled recording, parental controls with a PIN independent of the app lock, and M3U export.
- Six-tile Multiview with four layouts, active-tile audio and source failover.
- Downloads, backups, diagnostics and Arabic/English UI.
- Unified release system: release.json is the single source of truth for version, date, tests and reports, with a CI gate against stale reports or broken encoding.

### Fixes

- Arabic text in PRIVACY.md, TECHNICAL_GUIDE.md, SECURITY_FIXES.md and ROADMAP.md was mojibake on GitHub; repaired with an automatic encoding gate.
- Unified release dates, test reports, test files and package version; older reports are archived instead of left in the current location.
- Channel navigation: stable focus, no Enter re-activation of nav buttons, PageUp/PageDown and Ctrl+arrow shortcuts, and drawer focus management.
- Scheduled recording: completed files appear in Recordings immediately without an app restart.
- Centered the 13 sidebar items while keeping the brand and language selector fixed.
- Parental controls separated from the Settings app lock with a dedicated PRO Tools PIN.
- Fixed app-lock bypass, prototype pollution, atomic backup import and Xtream password persistence.
- Fixed recording race, rollback crash accounting, legacy download paths, double-gzip EPG and unknown channel counts.
- Fixed subtitle-off persistence, native subtitle indices, Escape handling, media-kind priority, prompt modal and favorite icon updates.
- Fixed manifest signing script, release workflow, CI media test and smoke test.

All 22 declared tests passed. Previous reports are archived, never left as current.
