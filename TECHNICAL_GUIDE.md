# GomizPlayer PRO IPTV — الدليل التقني | Technical Guide

**الإصدار الموصوف / Version described:** 2.0.5 · **آخر مراجعة / Reviewed:** 2026-11-28
في PowerShell استخدم `npm.cmd` إذا كان تشغيل ملفات `npm.ps1` ممنوعاً بسياسة النظام. / In PowerShell, use `npm.cmd` when the system execution policy blocks `npm.ps1`.
مصدر حقائق الإصدار هو الشيفرة و`package.json` ونتائج الاختبارات المسجلة في [`REPORT_TEST_RESULTS_AR.md`](REPORT_TEST_RESULTS_AR.md). لا تُعدّ الميزات غير المختبرة وعود توافق.

## العربية

### ما التطبيق؟
مشغّل IPTV/VOD لسطح مكتب Windows مبني بـ Electron وJavaScript. يدير مصادر المستخدم ويعرض البث المباشر والأفلام والمسلسلات، ولا يوفّر محتوى أو اشتراك IPTV.

### الوظائف الموجودة
- **المصادر:** قوائم M3U/M3U8 وبيانات Xtream ورابط مباشر؛ يمكن أن تتضمن العناصر رؤوس HTTP.
- **المكتبة:** Live TV، دليل البرامج، الأفلام، المسلسلات، المفضلة، سجل المشاهدة والبحث.
- **التشغيل:** HLS عبر hls.js، وMPEG-TS/M2TS عبر mpegts.js عندما يدعم runtime المتصفح، وMPEG-DASH عبر dash.js، إضافة إلى الوسائط التي يدعمها Chromium أصلياً.
- **Multiview:** حتى ست خانات بأربعة تخطيطات، مع اختيار صوت الخانة النشطة، وحفظ التخطيط/القنوات والتحويل للمصدر البديل عند فشل البث إذا توفر بديل.
- **أدوات PRO:** فحص صحة القنوات، إخفاء القنوات المعطلة اختيارياً، كشف التكرار، Catch-up المعتمد على بيانات المزود، التسجيل المجدول، الرقابة الأبوية، وتصدير M3U.
- **التنزيل والتسجيل:** إدارة التنزيلات وتسجيلات البث عبر FFmpeg عند توفره؛ التوافق متعلق بالبث والترميز والمزود.
- **الإعدادات والبيانات:** واجهة عربية/إنجليزية مع RTL، إعدادات ومصادر محلية، نسخ احتياطية واستعادة، تشخيص وسجلات محلية. تُخزّن بيانات الدخول عبر Electron `safeStorage` حيث يدعم النظام ذلك.
- **الصفحة الرئيسية:** ساعة، طقس وأوقات صلاة. طلبات الموقع/الطقس والصلاة تستخدم خدمات خارجية؛ راجع [`PRIVACY.md`](PRIVACY.md).

### التحديثات والبناء
- التحديثات تعتمد `electron-updater` وبيان `latest.yml` موقعاً بـ Ed25519؛ يتحقق التطبيق من البيان والملف قبل التنزيل. التراجع الآمن مرتبط بحارس الإصدار.
- `npm run dist` يبني NSIS وPortable x64 ويضع النتائج تحت `dist/v<version>/`.
- إصدار 2.0.5 بُني محلياً وعلى GitHub Actions ونُشر [للعامة](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.5) بأصول Setup وPortable وblockmap و`latest.yml` الموقّع.
- `dist/latest.yml` المحلي غير موقّع، بينما بيان CI المرفق بالإصدار موقّع ومتحقق منه. ملفات Windows لا تحمل توقيع Authenticode.

### الفحوص المنفذة والحدود
- `npm run test:ui` نجح محلياً: UI Smoke وMultiview، بما فيها عينة HLS H.264. يمكن اختيار Chrome المثبت عبر `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` عند الحاجة.
- نجحت مجموعات regression الخمس عشرة في مسار إصدار GitHub، كما نجح بناء الحزم والتحقق من وجودها.
- `npm audit`: صفر ثغرات معلنة بين 309 تبعيات في الفحص المسجل.
- لم يُختبر MPEG-DASH مع مزود فعلي، ولا يُعلن دعم DRM. اختبارات الوسائط المحلية لا تثبت التوافق مع كل مزودي IPTV أو إعدادات CORS والترميزات.
- الرقابة الأبوية مرشح محلي يتطلب PIN داخل التطبيق؛ ليست حاجز نظام تشغيل أمام من يملك وصولاً إلى ملفات المستخدم.
- ملفات Windows غير موقعة Authenticode، وقد يعرض Windows تنبيه ناشر غير معروف.

### بنية مختصرة
`src/main/` عمليات Electron والتخزين وIPC والشبكة والأسرار والتحديثات؛ `src/renderer/` الواجهة والمشغلات وMultiview؛ `src/shared/` منطق التصنيف المشترك؛ `tools/` اختبارات وأدوات التطوير؛ `.github/workflows/` فحوص CI وبناء مسودة الإصدار.

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
- Version 2.0.5 was built locally and by GitHub Actions and is [publicly released](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.5) with Setup, Portable, blockmap, and signed `latest.yml`.
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
