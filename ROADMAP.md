# GomizPlayer PRO IPTV — خارطة الطريق | Roadmap

**نطاق هذا المستودع / Repository scope:** تطبيق Windows فقط · **نسخة المصدر / Source version:** 2.0.2 · **آخر مراجعة / Reviewed:** 2026-11-27

## العربية

### الحالة الحالية
الشيفرة الحالية في `main` هي 2.0.2. اكتمل نقل المصدر والتوثيق إلى المستودع الجديد، واجتازت اختبارات إصدار CI وبناء Windows. أُنشئت الحزم محلياً، لكن لم يُنشر Release لأن توقيع manifest يحتاج سر Actions `UPDATE_SIGNING_PRIVATE_KEY`.

### المنجز في التطبيق
- إدارة مصادر M3U/M3U8 وXtream وروابط البث.
- Live TV وVOD ودليل البرامج والمفضلة والبحث والسجل.
- تشغيل HLS وMPEG-TS/M2TS وMPEG-DASH المتوافق والوسائط الأصلية للمتصفح.
- أدوات PRO: فحص صحة القنوات، failover عند توفر بديل، كشف التكرار، catch-up المعتمد على المزود، تسجيل مجدول، رقابة أبوية وتصدير M3U.
- Multiview حتى ست خانات بأربعة تخطيطات، مع اختيار الصوت وحفظ التشكيلة.
- تنزيلات وإعدادات ونسخ احتياطية وتشخيص محلي وواجهة EN/AR.

### العمل المتبقي
1. ضبط سر توقيع التحديث في المستودع، ثم تشغيل مسار **Build PC release draft** والتحقق من المسودة والأصول قبل نشرها.
2. اختبار MPEG-DASH مع مصادر حقيقية؛ لا يُعلن دعم DRM.
3. إجراء تحقق ممتد على أجهزة Windows ومصادر IPTV متعددة، خاصة توافق الترميز وCORS واستهلاك الذاكرة في Multiview.
4. أي دعم Stalker أو Chromecast/DLNA أو قنوات beta يحتاج تحديد نطاق واختبارات أجهزة وبنية نشر قبل اعتماده ضمن خارطة إصدار.

تطبيق Android TV خارج نطاق هذا المستودع؛ لا تسرد هذه الخارطة أرقام إصدارات Android أو حالته.

## English

### Current status
The source on `main` is version 2.0.2. Source and documentation have been moved to the new repository; release CI regression tests and Windows package builds passed. Local packages were also built, but no Release was published because manifest signing requires the `UPDATE_SIGNING_PRIVATE_KEY` Actions secret.

### Implemented in the app
- M3U/M3U8, Xtream, and direct stream source management.
- Live TV, VOD, TV guide, favorites, search, and viewing history.
- HLS, MPEG-TS/M2TS, compatible MPEG-DASH, and browser-native media playback.
- PRO tools: channel health checks, failover when an alternative exists, duplicate detection, provider-dependent catch-up, scheduled recording, parental filtering, and M3U export.
- Up to six Multiview tiles across four layouts, with audio selection and saved lineup.
- Downloads, settings, backups, local diagnostics, and EN/AR UI.

### Remaining work
1. Configure the repository update-signing secret, run **Build PC release draft**, then review the draft and assets before publishing.
2. Test MPEG-DASH with real providers; DRM is not claimed.
3. Perform extended checks on Windows devices and multiple IPTV sources, especially codec/CORS compatibility and Multiview memory use.
4. Stalker, Chromecast/DLNA, or beta channels require scoped requirements, device tests, and release infrastructure before being committed to a version plan.

The Android TV application is outside this repository; this roadmap does not state its version or status.
