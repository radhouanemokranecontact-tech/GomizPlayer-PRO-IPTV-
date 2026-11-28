# GomizPlayer PRO IPTV — Desktop for Windows

[العربية](#العربية) | [English](#english)

**Source version:** 2.0.4 · **Platform:** Windows x64 · **License:** MIT

**المصدر والإصدار:** 2.0.4 · **النظام:** Windows x64 · **الرخصة:** MIT

This is a player for user-provided IPTV/VOD sources; it does not include channels or subscriptions. See the [technical guide](TECHNICAL_GUIDE.md) and [current test report](REPORT_TEST_RESULTS_AR.md) for verified functionality and limits.

هذا مشغّل لمصادر IPTV/VOD التي يضيفها المستخدم؛ لا يتضمن قنوات أو اشتراكات. راجع [الدليل التقني](TECHNICAL_GUIDE.md) و[تقرير الاختبار الحالي](REPORT_TEST_RESULTS_AR.md) للميزات المتحققة والقيود.

## English

### Features in 2.0.4
- M3U/M3U8, Xtream, and direct stream sources; live TV, movies, series, guide, favorites, search, and history.
- HLS, MPEG-TS/M2TS, compatible MPEG-DASH, and browser-native media playback.
- PRO channel health tools, duplicate detection, provider-dependent catch-up, scheduled recording, parental filtering with its own dedicated PIN (independent of the app lock in Settings), and M3U export.
- Six-tile Multiview with four layouts, active-tile audio, saved selections, and available-source failover.
- Downloads, local backups, diagnostics, and Arabic/English UI.

### Run from source
```powershell
npm.cmd ci
npm.cmd start
```

### Release status
The 2.0.4 NSIS and portable x64 builds were created locally and in GitHub Actions. The [v2.0.4 GitHub release](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.4) includes Setup, Portable, blockmap, and the Ed25519-signed CI `latest.yml`. The local `dist/latest.yml` is unsigned by design. Windows executables are not Authenticode-signed.

## العربية

### مميزات 2.0.4
- مصادر M3U/M3U8 وXtream والرابط المباشر؛ بث مباشر وأفلام ومسلسلات ودليل ومفضلة وبحث وسجل مشاهدة.
- تشغيل HLS وMPEG-TS/M2TS وMPEG-DASH المتوافق والوسائط التي يدعمها المتصفح.
- أدوات PRO لفحص القنوات وكشف التكرار وCatch-up المعتمد على المزود والتسجيل المجدول والرقابة الأبوية برمز PIN مستقل عن قفل التطبيق في الإعدادات وتصدير M3U.
- Multiview حتى ست قنوات بأربعة تخطيطات، وصوت للخانة النشطة، وحفظ الاختيارات والتحويل إلى مصدر بديل متاح.
- تنزيلات ونسخ احتياطية محلية وتشخيص وواجهة عربية/إنجليزية.

### التشغيل من المصدر
```powershell
npm.cmd ci
npm.cmd start
```

### حالة الإصدار
بُنيت حزم 2.0.4 بصيغتي NSIS وPortable x64 محلياً وفي GitHub Actions. يضم [إصدار v2.0.4 على GitHub](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.4) ملفات Setup وPortable وblockmap و`latest.yml` الموقّع من CI. ملف `dist/latest.yml` المحلي غير موقّع تصميماً. ملفات Windows غير موقعة Authenticode.

## Privacy and security | الخصوصية والأمان

Playback and library data are local. Optional telemetry, updates, geolocation, weather, and prayer-time features may contact external services; review [`PRIVACY.md`](PRIVACY.md). Parental controls are an in-app convenience filter, not an OS security boundary.

تبقى بيانات التشغيل والمكتبة محلية. قد تتصل القياسات الاختيارية والتحديثات وتحديد الموقع والطقس وأوقات الصلاة بخدمات خارجية؛ راجع [`PRIVACY.md`](PRIVACY.md). الرقابة الأبوية مرشح داخل التطبيق وليست حاجزاً أمنياً على مستوى نظام التشغيل.
