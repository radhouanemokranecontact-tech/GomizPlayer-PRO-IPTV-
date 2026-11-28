# تقرير نتائج اختبار الإصدار 2.0.3

**النطاق:** نسخة Windows x64 من `GomizPlayer-PRO-IPTV-`، بتاريخ 2026-11-28. يصف هذا التقرير الإصدار الحالي 2.0.3 بعد إصلاحات الأخطاء؛ السجلات الأقدم في Git history هي سجل تاريخي.

## النتائج المحلية

| الفحص | النتيجة | الدليل أو النطاق |
|---|---|---|
| 16 مجموعة اختبار Node | PASS | SSRF، classification، secrets audit، backup، update guard، manifest signature، EPG stream، classification parity، net guard، hardening، PRO، PRO IPC، media، player engine، multiview overlay، bugfix |
| `npm run test:secrets` | PASS | تشفير/فك تشفير آمن، رفض كلمة مرور خاطئة، فشل واضح عند تلف البيانات |
| `npm run test:ui` | PASS | UI Smoke وMultiview عبر Playwright؛ بلا أخطاء JavaScript |
| `npm run smoke` | PASS | `SMOKE_RESULT PASS`، رمز خروج 0، بما في ذلك قفل التطبيق والرقابة الأبوية |
| `npm audit` | PASS | 0 ثغرات معلنة |
| بناء Windows محلي | PASS | NSIS وPortable x64 وblockmap في `dist/v2.0.3/` |
| مطابقة بيان التحديث المحلي | PASS | `dist/latest.yml` يطابق الحجم وبصمة SHA-512 لملف Setup |
| `verify:release-manifest` محلياً | FAIL متوقع | البيان المحلي غير موقّع؛ التحقق يتطلب البيان الموقّع من CI |

## ملفات البناء المحلية

| الملف | الحجم بالبايت |
|---|---:|
| `GomizPlayer-PRO-IPTV-Setup-2.0.3.exe` | 151,061,875 |
| `GomizPlayer-PRO-IPTV-Portable-2.0.3.exe` | 134,947,563 |
| `GomizPlayer-PRO-IPTV-Setup-2.0.3.exe.blockmap` | 158,266 |

ملفات Windows غير موقعة Authenticode، ولهذا قد يعرض Windows تحذير ناشر غير معروف.

## الإصدار على GitHub

يُنشأ الإصدار عبر سير **Build PC release draft** في GitHub Actions: يجري الاختبارات، يبني الحزم، يوقّع `dist/latest.yml` باستخدام السر `UPDATE_SIGNING_PRIVATE_KEY`، يتحقق من التوقيع، ثم يرفع Setup وPortable وblockmap والبيان الموقّع. رابط التشغيل والإصدار يُحدَّث بعد اكتماله.

## حدود التغطية

- لم يُختبر MPEG-DASH أو البث مع مزوّد IPTV فعلي؛ لا يُدّعى دعم DRM.
- نجاح اختبارات الوسائط المحلية لا يثبت التوافق مع كل خوادم IPTV أو الترميزات أو إعدادات CORS.
- توقيع manifest يمنع التلاعب ببيان التحديث، لكنه لا يستبدل توقيع Authenticode لملفات Windows.

---

# Version 2.0.3 Test Results (English)

**Scope:** Windows x64 build of the current 2.0.3 source, 2026-11-28.

| Check | Result | Evidence/scope |
|---|---|---|
| 16 Node regression groups | PASS | SSRF, classification, secrets audit, backup, update guard, manifest signature, EPG stream, parity, net guard, hardening, PRO, PRO IPC, media, player engine, Multiview overlay, bugfix |
| Electron secrets integration | PASS | Encryption/decryption and clear failure modes |
| Playwright UI smoke + Multiview | PASS | No JavaScript errors |
| Smoke test | PASS | `SMOKE_RESULT PASS`, exit code 0 |
| `npm audit` | PASS | 0 known vulnerabilities |
| Local Windows build | PASS | NSIS, portable x64, blockmap in `dist/v2.0.3/` |
| Local manifest hash/size match | PASS | `dist/latest.yml` matches the Setup artifact |
| Local `verify:release-manifest` | Expected FAIL | Local manifest is unsigned; CI signs it with the repository secret |

GitHub release assets are produced by the release workflow with an Ed25519-signed `latest.yml`; the run and release links are recorded after completion. Windows binaries are not Authenticode-signed. No real IPTV provider or DRM support was tested.
