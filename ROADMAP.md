# Gomiz Player IPTV — Roadmap / خارطة الطريق

[العربية](#العربية) | [English](#english)

## العربية

### الإصدار الحالي
**PC:** v2.0.2 (PRO) · **Android:** 1.0.4 — مستقر، مع نسخ احتياطي وتحديثات تفاضلية موقّعة.
**آخر تحديث للخارطة:** 2026-11-27.

### مكتمل ✅
- PRO 2.0: Multiview (حتى 6 قنوات، 4 تخطيطات، صوت من خانة واحدة، تحويل تلقائي للبديل، حفظ التشكيلة)
- تشغيل MPEG-DASH عبر dash.js محلياً للمصادر MPD المتوافقة (دون ادعاء دعم DRM؛ الاختبار مع مزود حقيقي ما زال مطلوباً)
- P0: توقيع APK (Keystore) · Network Security Config · نسخ بيانات احتياطي · توقيع manifest
- P1: CI · ربط الاختبارات (7 suites) · تراجع آمن · تشخيص محلي
- P2: إفصاح الخصوصية · ترجمات · توثيق ترخيص FFmpeg · قرار الحجم

### أُنجز في 2.0 (PRO) ✅
- طبيب القنوات · تحويل تلقائي للمصدر البديل · كشف التكرار · Catch-up · تسجيل مجدول · رقابة أبوية · تصدير M3U

### مؤجّل إلى 2.1+ (قرار واعٍ)
| الميزة | السبب |
|---|---|
| Stalker | بروتوكول منفصل (portal + cookies) — مشروع مستقل |
| Chromecast / DLNA | يتطلب أجهزة حقيقية للاختبار (لا emulator) |
| قنوات beta + rollout تدريجي | يتطلب بنية نشر متعددة Releases |

### لا يُنفّذ (قرار تصميمي)
- web installer لتقليل الحجم — يتعارض مع سياسة «المحتوى الموقّع فقط».

---

## English

### Current
**PC:** v2.0.2 (PRO) · **Android:** 1.0.4 — stable, backed up, differential signed updates.
**Roadmap updated:** 2026-11-27.

### Done ✅
- PRO 2.0: Multiview (up to 6 channels, 4 layouts, single audio tile, per-tile failover, remembered layout)
- MPEG-DASH playback through locally bundled dash.js for compatible MPD streams (no DRM claim; real provider validation remains)
- P0: APK signing, Network Security Config, data backup, signed update manifest
- P1: CI, 7 test suites, safe rollback, local crash diagnostics
- P2: privacy disclosure, translations, FFmpeg license notice, size decision

### Done in 2.0 (PRO) ✅
Library Doctor, auto-failover, duplicate detection, catch-up (provider-dependent), scheduled recording, parental controls, M3U export.

### Deferred to 2.1+ (deliberate)
Stalker (separate protocol), Chromecast/DLNA (real hardware needed), beta channels + staged rollout.

### Won't do
Web installer — conflicts with the signed-content-only policy.
