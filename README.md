# GomizPlayer PRO IPTV — Desktop (Windows)

[English](#english) | [العربية](#العربية)

📘 **الدليل التقني الشامل:** [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — يشرح التطبيق كما يُستخدم فعلياً، مع كل الميزات والتفاصيل التقنية والحدود المعروفة.
📘 **Full technical guide:** [TECHNICAL_GUIDE.md](TECHNICAL_GUIDE.md) — what the app really does, internals and known limits.


## GomizPlayer PRO — what's new in 2.0

| Feature | What it does |
|---|---|
| **Library Doctor** | Tests every live channel (HLS / TS / media), shows Working / Dead / Untested, can hide dead channels |
| **Smart failover** | When a live stream fails, silently switches to another source of the *same* channel (up to 3 hops) |
| **Duplicate detection** | Finds the same channel across sources (tvg-id, normalised name, quality tags) and exports a clean playlist |
| **Catch-up** | Reads `catchup*` M3U attributes and Xtream timeshift; past programmes in the TV Guide are playable |
| **Scheduled recordings** | Record a channel at a chosen time (persisted, survives restarts, conflict + early-stop detection) |
| **Parental controls** | Hide adult keywords / categories; enabling requires an app-lock PIN |
| **MPEG-DASH** | Local bundled dash.js playback for compatible MPD streams |
| **Export** | Clean M3U (de-duplicated and/or verified-working only) |

Everything runs locally. Your data folder is unchanged, so upgrading from 1.x keeps sources, favourites and settings.


> **Release integrity:** `docs/archive/RELEASE_MANIFEST-1.0.33.yml` is a historical signed manifest, not the current release manifest. Release builds must generate `latest.yml` from their actual artifacts and sign it with the private Ed25519 release key. The app verifies the signed manifest and artifact hashes before download. Windows installer files are not Authenticode-signed; Windows may show an unknown-publisher warning.

## English

Gomiz Player IPTV Desktop is the Windows companion application for the Android TV player. It is built with **Electron** and JavaScript and provides a desktop experience for managing IPTV sources.

### Features
- M3U / M3U8 playlist and Xtream Codes source management
- Live TV, movies, series, favorites and search
- Electron-based desktop interface
- Shared classification logic with the Android app

> **Note:** This repository contains the desktop/Windows application only. The Android TV application lives in the separate `GomizPlayer-IPTV-APK` repository.

### About the installer size (~144 MB)
The installer bundles the full Electron/Chromium runtime so the app runs **offline, standalone, with no external dependencies**. The application code itself is small (~1.4 MB of JS); the rest is Chromium. Updates are **differential** (`.blockmap`) so repeated updates download only the changed blocks. The app verifies the Ed25519-signed update manifest and its artifact hashes before downloading. Windows installer files are not Authenticode-signed, so Windows may show an unknown-publisher warning.

### Run
```bash
npm install
npm start
```

---


## GomizPlayer PRO — الجديد في 2.0

- **طبيب القنوات:** يختبر كل قناة مباشرة ويُظهر (تعمل / معطّلة / لم تُفحص) مع إمكانية إخفاء المعطّلة.
- **تحويل ذكي:** عند فشل بث مباشر ينتقل تلقائياً إلى مصدر آخر لنفس القناة (حتى 3 محاولات).
- **كشف التكرار:** يجد القناة نفسها عبر المصادر ويصدّر قائمة نظيفة.
- **مشاهدة ما فات (Catch-up):** يدعم سمات `catchup` وXtream timeshift، والبرامج السابقة قابلة للتشغيل من الدليل.
- **التسجيل المجدول:** سجّل قناة في وقت محدد (يبقى بعد إعادة التشغيل).
- **رقابة أبوية:** إخفاء كلمات/تصنيفات؛ التغيير يتطلب PIN قفل التطبيق.
- **MPEG-DASH:** تشغيل محلي عبر dash.js لمصادر MPD المتوافقة؛ دعم DRM غير معلن.
- **تصدير M3U** نظيف (بدون تكرار و/أو القنوات العاملة فقط).

بياناتك لا تتغير عند الترقية من 1.x.

## العربية

**Gomiz Player IPTV — سطح المكتب** هو التطبيق المرافق لنظام Windows لمشغّل Android TV، مبني بـ **Electron** وJavaScript، ويوفّر تجربة سطح مكتب لإدارة مصادر IPTV.

### المميزات
- إدارة قوائم M3U / M3U8 واشتراكات Xtream Codes
- البث المباشر والأفلام والمسلسلات والمفضلة والبحث
- واجهة سطح مكتب مبنية بـ Electron
- منطق تصنيف مشترك مع تطبيق الأندرويد

> **ملاحظة:** يحتوي هذا المستودع على تطبيق سطح المكتب (Windows) فقط. تطبيق Android TV موجود في مستودع منفصل باسم `GomizPlayer-IPTV-APK`.

### حول حجم المُثبّت (~144 ميجابايت)
يضمّ المُثبّت تشغيل Electron/Chromium كاملاً ليعمل التطبيق **دون اتصال وبلا تبعيات خارجية**. كود التطبيق نفسه صغير (~1.4 ميجابايت) والباقي هو Chromium. التحديثات **تفاضلية** (`.blockmap`) فتنزّل الكتل المغيّرة فقط. يتحقق التطبيق من توقيع Ed25519 لبيان التحديث ومن تطابق بصمات الملفات قبل التنزيل. ملفات تثبيت Windows غير موقّعة بـ Authenticode، لذلك قد يعرض Windows تحذير «ناشر غير معروف» عند التنزيل أو التشغيل.

### التشغيل
```bash
npm install
npm start
```

## Engineering audit status (2026-11-27)

The current source bundles dash.js locally alongside hls.js and mpegts.js. MPEG-DASH playback depends on stream codecs, server behavior, and CORS; DRM support is not claimed. Parental controls are a convenience filter that requires an app-lock PIN; they do not protect against someone who can edit the user's local application data.

تاريخ تحديث الملاحظات الهندسية: 2026-11-27. تتطلب الرقابة الأبوية PIN لقفل التطبيق؛ وهي مرشح محلي وليست حماية من تعديل ملفات بيانات المستخدم. بيان 1.0.33 التاريخي موجود في `docs/archive/`، وتُوقّع بيانات كل إصدار من `dist/latest.yml` بمفتاح الإصدار.
