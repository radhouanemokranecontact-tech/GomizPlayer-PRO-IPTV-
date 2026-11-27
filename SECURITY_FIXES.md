# حالة الأمان — GomizPlayer PRO IPTV 2.0.2

هذه الوثيقة تلخص وسائل الحماية الموجودة في الشيفرة الحالية، لا قائمة تغييرات من إصدار 1.0.x.

## وسائل الحماية في الشيفرة

| المجال | السلوك الحالي | المكونات الرئيسية |
|---|---|---|
| اتصالات الشبكة | فحص عناوين الاتصال والتحويلات، ومنع الوجهات المحلية/المحظورة في طلبات المصادر، مع حدود لحجم الاستجابة | `src/main/net-guard.js`, `src/main/main.js` |
| قوائم التشغيل والتنزيل | تحقق من الروابط والتحويلات، حدود للحجم، وتنقية رؤوس HTTP؛ تشغيل FFmpeg بقيود بروتوكول | `src/main/m3u.js`, `src/main/downloads.js` |
| IPC | واجهة preload محدودة والتحقق من مرسل الرسائل في handlers | `src/main/preload.js`, `src/main/main.js`, `src/main/pro/ipc.js` |
| واجهة التطبيق | سياسة CSP تمنع object وframe وform action وتقيّد مصادر السكربت | `src/renderer/index.html` |
| الأسرار | تخزين بيانات الدخول عبر Electron `safeStorage`، مع منع تحديثات الإعدادات العامة من تعيين حقول الأسرار المشتقة | `src/main/secrets.js`, `src/main/main.js` |
| النسخ الاحتياطي | التحقق من المعرفات والمسارات عند الاستيراد، ومنع الخروج عن مجلد cache | `src/main/store.js`, `src/main/main.js` |
| التحديثات | التحقق من توقيع Ed25519 وربط manifest بالإصدار والملف والحجم والبصمة، مع حماية من الرجوع لإصدار أقدم | `src/main/manifest-verify.js`, `src/main/update-guard.js` |
| أدوات PRO | فحص الروابط في health/scheduler، والرقابة الأبوية تتطلب PIN لقفل التطبيق | `src/main/pro/*` |

الرقابة الأبوية مرشح محلي لواجهة التطبيق وليست حاجزاً أمنياً ضد من يستطيع تعديل ملفات بيانات المستخدم. ولا تعادل حماية حسابات Windows.

## ما اختُبر لإصدار 2.0.2

- اجتازت مجموعات CI الخمس عشرة: SSRF، network guard، hardening، PRO، PRO IPC، media، classification، secrets audit، backup، update guard، manifest signature، EPG stream، classification parity، player engine، multiview overlay.
- اجتاز `npm audit`: صفر ثغرات معلنة بين 309 تبعيات في تاريخ الفحص.
- نجحت اختبارات Playwright المحلية للواجهة وMultiview.
- تقرير النتائج الكامل: [`REPORT_TEST_RESULTS_AR.md`](REPORT_TEST_RESULTS_AR.md).

## حدود مهمة

- مفتاح Ed25519 الخاص لا يُحفظ في المستودع. بعد ضبط سر `UPDATE_SIGNING_PRIVATE_KEY` المطابق للمفتاح العام، نجح CI في توقيع manifest 2.0.2 والتحقق منه ورفع أصول الإصدار. راجع [صفحة الإصدارات](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases) لحالة الإتاحة الحالية.
- ملف `dist/latest.yml` المحلي غير موقّع ولا ينبغي نشره كتحديث.
- ملفات Windows غير موقعة Authenticode، وقد يظهر تحذير ناشر غير معروف.
- لم يُختبر بث MPEG-DASH/DRM حقيقي، ولا تعني الاختبارات المحلية ضماناً ضد مخاطر كل مزوّد أو شبكة.
- أي نقطة telemetry يهيئها المشغّل تستقبل البيانات وفق الإعدادات والموافقة؛ راجع [`PRIVACY.md`](PRIVACY.md).

## English

This document describes controls in the current 2.0.2 source, not a fix list from version 1.0.x.

### Controls in the current source

| Area | Current behavior | Main components |
|---|---|---|
| Network requests | Validates connection addresses and redirects, blocks restricted destinations for source requests, and caps response sizes | `src/main/net-guard.js`, `src/main/main.js` |
| Playlists and downloads | Validates URLs/redirects, limits sizes, sanitizes HTTP headers, and restricts FFmpeg protocols | `src/main/m3u.js`, `src/main/downloads.js` |
| IPC | Uses a limited preload API and validates message senders in handlers | `src/main/preload.js`, `src/main/main.js`, `src/main/pro/ipc.js` |
| Renderer | CSP disallows objects, frames, and form actions, and limits script sources | `src/renderer/index.html` |
| Secrets | Uses Electron `safeStorage` for credentials and prevents generic settings updates from setting derived secret fields | `src/main/secrets.js`, `src/main/main.js` |
| Backups | Validates identifiers and paths on import and prevents cache paths from escaping their directory | `src/main/store.js`, `src/main/main.js` |
| Updates | Verifies Ed25519 signatures and binds manifests to version, filename, size, and hash; blocks rollback | `src/main/manifest-verify.js`, `src/main/update-guard.js` |
| PRO tools | Health checks and scheduler validate URLs; parental filtering requires the app-lock PIN | `src/main/pro/*` |

Parental controls are a local UI filter, not a security barrier against someone who can modify the user's application data. They do not replace Windows account protections.

### Verification for version 2.0.2
- All 15 GitHub Actions regression groups passed: SSRF, network guard, hardening, PRO, PRO IPC, media, classification, secrets audit, backup, update guard, manifest signature, EPG stream, classification parity, player engine, and Multiview overlay.
- `npm audit` reported 0 known vulnerabilities across 309 dependencies in the recorded scan.
- Local Playwright UI Smoke and Multiview checks passed.
- See [`REPORT_TEST_RESULTS_AR.md`](REPORT_TEST_RESULTS_AR.md) for the full current results.

### Important limits
- The private Ed25519 key is not stored in the repository. After configuring `UPDATE_SIGNING_PRIVATE_KEY` to match the app's embedded public key, CI signed and verified the 2.0.2 manifest and uploaded all release assets. See the [GitHub Releases page](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases) for current availability.
- Local `dist/latest.yml` is unsigned and must not be published as an update feed.
- Windows binaries are not Authenticode-signed; Windows may show an unknown-publisher warning.
- Real-provider MPEG-DASH/DRM playback was not tested. Local test success does not guarantee safety against every provider or network.
- Telemetry endpoint behavior depends on the configured endpoint and user settings/consent; see [`PRIVACY.md`](PRIVACY.md).
