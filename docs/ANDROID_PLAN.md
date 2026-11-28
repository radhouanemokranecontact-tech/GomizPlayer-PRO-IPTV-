# GomizPlayer IPTV — Android TV & Android Phone — خطة تنفيذ احترافية

تاريخ الإعداد: 2026-11-17
نطاق: تطبيق Android أصيل (Kotlin) لكل من **Google TV / Android TV** و**هواتف/أجهزة Android**، بكامل ميزات GomizPlayer IPTV (Windows Electron).
التوزيع: APK مباشر (GitHub) **ثم** Google Play Store.

> **تنبيه النطاق والحالة:** هذه وثيقة تخطيط تاريخية لتطبيق Android منفصل، وليست وصفاً لما نُفذ في تطبيق Windows أو حالة تطبيق Android الحالية. آخر مراجعة لهذه الخطة: 2026-11-17.
>
> **Scope/status:** This is a historical plan for a separate Android app. It does not describe the Windows implementation or the current Android app status. Plan last reviewed: 2026-11-17.

---

## 1. الرؤية والهدف
تقديم مشغل IPTV/VOD لكل منصة في نفس حزمة APK (أو AAB)، يحقق **تكافؤًا وظيفيًا كاملًا** مع تطبيق Windows الحالي:
تشغيل Live/VOD(SRT)/Series، EPG، المفضلة، كثير من البروفايلات، التحميل، التسجيل، الطقس/الصلاة، Hero/الواجهة، RTL/i18n، Profiles، الإعدادات الكاملة.

---

## 2. الحزمة التقنية المعتمدة (احترافية)

| الطبقة | التقنية | السبب |
|---|---|---|
| اللغة | Kotlin (كل الوحدات) | أساسي |
| UI | **Jetpack Compose + Compose for TV** (أولًا) + Material 3 (Phone) | واجهة واحدة، focus management قوي، دعم رسمي من Google |
| التشغيل | **Media3 / ExoPlayer** | HLS, DASH, MPEG-TS, progressive MP4؛ VOD و Live، DRM إن لزم |
| EPG | XMLTV parser مخصص + Room DB | يغذي «ما يعرض الآن/التالي» |
| DB | Room + coroutine Flow | Sources, favorites, history, EPG, profiles, downloads |
| الشبكة | OkHttp + Retrofit + kotlinx.serialization | M3U/Xtream/XMLTV/REST |
| التنزيل/التسجيل | WorkManager + **ffmpeg-kit** (مدمج في APK) | لتنزيل streams إلى ملف + تسجيل live |
| الأسرار | Android Keystore + EncryptedSharedPreferences | كلمات مرور Xtream لا تُخزن أبدًا علنًا |
| DI | Hilt | نظافة التبعيات |
| التخزين المحلي للإعدادات | DataStore (Proto/Preferences) | بدل gomizplayer.json |
| الاختبارات | JUnit4/5 + Robolectric + Compose UI tests + Emulator TV + جهاز حقيقي | |
| CI/CD | GitHub Actions: build APK/AAB + sign + upload artifact | أتمتة كاملة |
| التوقيع | Keystore مستودع مخفي + Play App Signing | |

---

## 3. البنية المعمارية (Clean + MVVM)

```
app/
├── core/
│   ├── domain/       (models/usecases: Source, Channel, Movie, Series, Favorite, Profile, EpgNowNext, DownloadItem, RecordingItem)
│   ├── data/         (Room, DataStore, network, parsers, repositories)
│   ├── classification/  (م port كامل لـ src/shared/classification.js — Live/VOD/Series + tests)
│   ├── m3u/          (M3U tokenizer + parser port لـ src/main/m3u.js + tests)
│   ├── xmltv/        (XMLTV parser port لـ src/main/epg.js + tests)
│   ├── xtream/       (Xtream API client: player_api, get.php, streams, categories)
│   ├── secrets/      (Keystore-backed encryption)
│   └── i18n/         (RTL + AR/FR/EN strings)
├── feature/
│   ├── home/         (Hero، rows، widgets: clock/weather/prayer، latest releases)
│   ├── live/         (Live browser: groups, search, favorites entry)
│   ├── vod/          (Movies/Series catalog: grids, filters, pagination)
│   ├── detail/       (Detail panel + recommendations port)
│   ├── player/       (PlayerScreen: live/VOD, overlay controls, EPG strip, record btn)
│   ├── drawer/       (Live browser: categories + search + dedupe + paging)
│   ├── favorites/    (My List TV + My Movies & Series)
│   ├── downloads/    (Downloads list + progress + actions)
│   ├── recordings/   (Recordings list + playback + delete — نعم/لا)
│   ├── sources/      (Add/Edit/Refresh/Delete sources + expiry display)
│   ├── epg/          (EPG views, timeline, refresh)
│   ├── settings/     (All settings sections, profiles, lock, privacy, network)
│   └── guide/        (TV Guide fullscreen)
└── tv/               (Leanback/Compose TV focus glue: focus graph, remote mapping)
```

---

## 4. مصفوفة التكافؤ (Parity Matrix) — كل ميزة Windows → Android

| الميزة (Windows) | Android |
|---|---|
| M3U/Xtream/Single sources + caching | نفس المنطق، Room للـ cache |
| Classification engine (classification.js) | Port كامل + unit tests |
| EPG (XMLTV, now/next strip) | Parser + Room + UI |
| Hero carousel (latest VOD) | Compose pager + lazy images |
| Home grid/rows/limit/density | إعدادات + RTL |
| Favorites: My List TV + My Movies & Series | Tab/شاشة مستقلة + heart toggle |
| History (Live/VOD) | Room table + restore positions |
| Profiles (create/delete/lock) | DataStore/Room + ملف Lock by PIN |
| Downloads (ffmpeg → .mp4) | ffmpeg-kit من داخل APK |
| Recordings (live recording) | ffmpeg-kit recording |
| Downloads/Recordings folders | SAF / app-internal media dir |
| Network settings (UA, proxy, VPN) | OkHttp interceptors + system proxy |
| Backup/Restore (export produite) | SAF export/import JSON |
| Weather/Prayer widget | Open-Meteo + Aladhan APIs (نفس الفكرة) |
| RTL (Arabic) | Compose layoutDirection(RTL) |
| i18n AR/EN/FR | strings + منطق RTL |
| Settings كاملة (Home, Player, General, Storage, Privacy, Reset...) | 1:1 أقسام |
| App Lock (PIN) + Visibility | BiometricPrompt + PIN screen |
| Updates (electron-updater) | GitHub Releases check (أو Play) |
| Diagnostics export | SAF + ZIP export |
| Analytics consent + telemetry | كل الخيارات كما هي + opt-in |
| Low-perf mode | Kotlin equivalent (detect hardware flags) |

---

## 5. خطة التشغيل (Player) بالتفصيل

- ExoPlayer يبني:
  - Live HLS/DASH/MPEG-TS عبر `MediaSources` (ProgressiveMediaSource / HlsMediaSource / DashMediaSource / SsMediaSource / LocalMediaSource).
  - VOD progressive MP4.
- Controls overlay: Play/Pause/Stop/Vol/Seek(+/-)/Fullscreen/Quality/Audio/Subtitles/Speed/Aspect/Record/Favorite/EPG now-next/Back.
- D-pad navigation على TV (Up/Down/Left/Right/OK/Back).
- أزرار Color (R/G/Y/B إن لزم).
- Record: Spawn ffmpeg-kit → مصدر URL → ملف mp4.
- Download: نفس الشيء مع save.
- Track history positions + resume.

---

## 6. الأداء والتفاعل على TV
- Leanback/Compose focus scale (focused card يكبر + shadow).
- RTL focus order.
- خلفية Hero blur/fade.
- LazyImage loading للبوسترات/الشعارات.
- Paging للمكتبات الكبيرة (1000+ قناة).
- Background EPG refresh (WorkManager, periodic).
- Temp cache cleanup.

---

## 7. الأمان والخصوصية
- كلمات مرور Xtream: Keystore-only، لا reachplain text في logs أو backups.
- Allowlist domains للتنزيل (host allowlist) لمنع SSRF داخلي.
- Local/Private network block (نفس SSRF guard من النسخة الحالية إن أردنا الحفاظ على السياسة).
- Telemetry opt-in فقط + Privacy screen.
- Backup مشفرة أو ZIP محمي بكلمة مرور (اختياري في Phase 2).

---

## 8. المزامنة مع Windows (Bonus — اختياري لكن مهم)
- تصدير/استيراد `gomizplayer.json` (Windows) → Android (import) لاسترجاع المصادر/المفضلة/التاريخ/الإعدادات في الجهاز الجديد.
- هذا يمنحك تجربة "استرجاع جهازك" بدون إعادة الضبط يدويًا.

---

## 9. المراحل التفصيلية (Timeline واقعي)

| المرحلة | الزمن | المخرجات |
|---|---|---|
| **Phase 0 — PoC** | 1–2 أسبوع | APK يفتح على TV Emulator + Phone، تشغيل M3U واحد Live/VOD، EPG stripped |
| **Phase 1 — Core** | 3–4 أسابيع | Sources, classification, EPG, Home/Hero, Favorites, History, Profiles, Settings الأساسية, i18n/RTL |
| **Phase 2 — Parity** | 3–4 أسابيع | Downloads + Recording (ffmpeg-kit), Backup/Restore, Network settings, Lock/Privacy, Full Settings, Diagnostics/telemetry |
| **Phase 3 — TV Polish** | 1–2 أسبوع | Focus perfection, Leanback feel, Emulator TV + Dev real TV, Preview/quality, audio/subtitles |
| **Phase 4 — Release** | 1 أسبوع | Signing, AAB, Play Console internal testing → production, GitHub Releases, crash reporting |
| **المجموع التقريبي** | **9–13 أسبوعًا** (لمطور/واحد معتمد كليًا) | APK/AAB جاهز + Play Store (بعد المراجعة) |

**ملاحظة صادقة:** نطاق «كل الميزات كاملة» أكبر بكثير من APK واحد بسيط؛ التقديرات أعلاه تعتمد على الالتزام الكامل بالوقت وخبرة Android. إن أردنا تسليمًا أسرع، نقسم إلى MVP (Phase 0+1) أولًا.

---

## 10. معايير القبول (Definition of Done)
- [ ] Build يفشل = 0 على Emulator TV + Phone.
- [ ] تشغيل M3U + Xtream + EPG دون أخطاء.
- [ ] Downloads تنتج ملفًا يُشغّل.
- [ ] Recording ينتج ملفًا.
- [ ] Favorites تبقى بعد إعادة التشغيل.
- [ ] RTL العربية سليمة على TV.
- [ ] Sign/Upload إلى Play internal testing OK.
- [ ] CI يبني APK/AAB تلقائيًا عند Tag.

---

## 11. المخاطر والتخفيف
| الخطر | التخفيف |
|---|---|
| اختلاف تشغيل Streams على أجهزة TV مختلفة | ExoPlayer + fallbacks (HLS→progressive)؛ اختبار جهاز حقيقي |
| تسجيل/تنزيل streams يتطلب فحوص uprawnien | نضع ffmpeg-kit في APK (sideload)؛ Play Store قد يرفض live recording → نُبقي sideload/GitHub كخيار |
| Kotlin timeline يضغط على الفريق | MVP أولًا، feature-flag للميزات الكبيرة |
| بيانات المستخدم بين Windows/Android | أداة Import/Export انتقال |
| Android TV permissions/SAF للميديا | Manage via Storage Access Framework |

---

## 12. الخطوة التالية المباشرة بعد موافقتك
1. إنشاء مشروع Android (`android/` أو مجلد جديد `gomizplayer-android`).
2. اختيار Compose for TV + Material 3 Phone كأساس.
3. Port الـ classification engine كـ library Kotlin + اختبارات الآن (أسرع مكتسب).
4. تشغيل PoC على Emulator TV.

**بموافقتك نبدأ Phase 0 فورًا.**
