GomizPlayer PRO IPTV 2.0.5 — Windows x64

Release date: 2026-11-28

This release unifies version, date, tests, source hash and reports into one tracked release manifest (`release.json`). Every new version now regenerates its reports, archives the previous ones, and fails CI if reports are stale or Arabic text is mis-encoded.

English
-------
Features:
- M3U/M3U8, Xtream and direct sources; live TV, movies, series, guide, favorites, search and history.
- HLS, MPEG-TS/M2TS, compatible MPEG-DASH and native playback.
- PRO tools: channel health, dedupe, catch-up, scheduled recording, parental controls with a PIN independent of the Settings app lock, and M3U export.
- Six-tile Multiview with four layouts, active-tile audio and failover.
- Downloads, backups, diagnostics and Arabic/English UI.
- Unified release system: `release.json`, `npm run test:all`, `npm run release:sync` and `npm run release:check`.

Fixes:
- Arabic documentation encoding repaired and enforced by an automatic gate.
- Channel navigation focus: stable focus, no Enter re-activation, PageUp/PageDown and Ctrl+arrow shortcuts, drawer focus management.
- Scheduled recordings appear in Recordings immediately when finished, without restarting.
- The 13 sidebar items are centered while the brand and language selector stay fixed.
- Parental controls separated from the Settings app lock with a dedicated PIN.
- App-lock bypass, prototype pollution, partial backup import and Xtream password persistence fixed.
- Recording race, rollback crash accounting, legacy downloads, double-gzip EPG and unknown channel counts fixed.
- Subtitle-off, native subtitle indices, Escape handling, media-kind priority, prompt modal and favorite icon fixed.
- Manifest signing, release preflight, CI media test and smoke test fixed.

Authoritative update assets (GitHub Actions build, Ed25519-signed manifest):
- GomizPlayer-PRO-IPTV-Setup-2.0.5.exe
- GomizPlayer-PRO-IPTV-Portable-2.0.5.exe
- GomizPlayer-PRO-IPTV-Setup-2.0.5.exe.blockmap
- latest.yml

Locally built diagnostic copies (unsigned manifest, NOT for auto-update): files ending in -local and latest-local-unsigned.yml.

Windows executables are not Authenticode-signed; Windows may show an unknown-publisher warning. No real IPTV provider or DRM support was tested.

---

العربية
-------
إصدار GomizPlayer PRO IPTV 2.0.5 — Windows x64

يوحّد هذا الإصدار رقم الإصدار والتاريخ والاختبارات وبصمة المصدر والتقارير في ملف واحد (`release.json`). مع كل إصدار جديد تُعاد توليد التقارير ويُؤرشف التقرير السابق، ويفشل CI إذا كانت التقارير قديمة أو إذا كان الترميز العربي مكسوراً.

الميزات:
- مصادر M3U/M3U8 وXtream والرابط المباشر؛ بث مباشر وأفلام ومسلسلات ودليل ومفضلة وبحث وسجل.
- تشغيل HLS وMPEG-TS/M2TS وMPEG-DASH المتوافق والوسائط الأصلية.
- أدوات PRO: فحص القنوات، كشف التكرار، Catch-up، تسجيل مجدول، رقابة أبوية برمز PIN مستقل عن قفل التطبيق، وتصدير M3U.
- Multiview حتى ست قنوات بأربعة تخطيطات وصوت للخانة النشطة والتحويل إلى مصدر بديل.
- تنزيلات ونسخ احتياطية وتشخيص وواجهة عربية/إنجليزية.
- نظام إصدار موحّد: `release.json` و`npm run test:all` و`npm run release:sync` و`npm run release:check`.

الإصلاحات:
- إصلاح ترميز التوثيق العربي ومنع تكراره بفحص تلقائي.
- تنقل القنوات: تركيز ثابت، منع إعادة تفعيل الأزرار بـ Enter، اختصارات PageUp/PageDown وCtrl+الأسهم، وإدارة تركيز قائمة القنوات.
- ظهور التسجيل المجدول في «التسجيلات» فور انتهائه دون إعادة تشغيل التطبيق.
- توسيط العناصر الثلاثة عشر في الشريط الجانبي مع تثبيت الشعار ومحدد اللغة.
- فصل الرقابة الأبوية عن قفل التطبيق برمز PIN مستقل.
- إصلاح تجاوز قفل التطبيق، تلوث النموذج الأولي، استيراد نسخة احتياطية ناقص، وحفظ كلمة مرور Xtream.
- إصلاح سباق التسجيل، عدّ أعطال التشغيل، مسارات التنزيل القديمة، فك ضغط EPG مرتين، وعدّ القنوات غير المعروفة.
- إصلاح إيقاف الترجمات، فهارس الترجمة الأصلية، مفتاح Escape، أولوية نوع الوسيط، نافذة الإدخال، وأيقونة المفضلة.
- إصلاح توقيع البيان، فحص الإصدار، اختبار الوسائط في CI، واختبار smoke.

أصول التحديث المعتمدة (بناء GitHub Actions مع بيان موقّع Ed25519):
- GomizPlayer-PRO-IPTV-Setup-2.0.5.exe
- GomizPlayer-PRO-IPTV-Portable-2.0.5.exe
- GomizPlayer-PRO-IPTV-Setup-2.0.5.exe.blockmap
- latest.yml

النسخ المحلية للتشخيص (بيان غير موقّع، غير مخصصة للتحديث التلقائي): الملفات المنتهية بـ -local وlatest-local-unsigned.yml.

ملفات Windows غير موقّعة Authenticode، وقد يعرض Windows تحذير ناشر غير معروف. لم يُختبر بث مزوّد فعلي ولا دعم DRM.
