# تقرير نتائج اختبار الإصدار 2.0.2

**النطاق:** نسخة Windows x64 من المستودع الجديد `GomizPlayer-PRO-IPTV-`، بتاريخ 27-11-2026. هذا هو التقرير الحالي؛ سجلات التدقيق الأقدم محفوظة عند الحاجة في Git history ولا تمثل نتائج 2.0.2.

## النتائج الحالية

| الفحص | النتيجة | الدليل أو النطاق |
|---|---|---|
| Playwright UI Smoke | PASS | عناصر PRO والتدفق البديل وPIN وXSS والعربية |
| Playwright Multiview | PASS | WebM وHLS H.264، failover، الصوت، 4 تخطيطات، حفظ الحالة، RTL والتنظيف |
| GitHub release regression | PASS | 15 مجموعة: SSRF، net guard، hardening، PRO، PRO IPC، media، classification، secrets audit، backup، update guard، manifest signature، EPG stream، classification parity، player engine، multiview overlay |
| `npm audit` | PASS | 0 ثغرات من 309 تبعيات (0 منخفضة/متوسطة/عالية/حرجة) |
| بناء Windows محلي | PASS | NSIS وPortable x64 وblockmap أُنشئت في `dist/v2.0.2/` |
| بناء Windows في GitHub Actions | PASS | أُنشئت الحزم وتحقق المسار من وجودها |
| توقيع بيان التحديث في GitHub | BLOCKED | السر `UPDATE_SIGNING_PRIVATE_KEY` غير مضبوط؛ أوقف المسار نشر المسودة |

## ملفات البناء المحلية

| الملف | الحجم بالبايت |
|---|---:|
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe` | 151,060,265 |
| `GomizPlayer-PRO-IPTV-Portable-2.0.2.exe` | 134,938,997 |
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe.blockmap` | 158,245 |

`dist/latest.yml` يحدد الإصدار 2.0.2، وقد طابق الحجم وبصمة SHA-512 لملف Setup في الفحص المحلي. البيان المحلي غير موقّع، وملفات Windows غير موقعة Authenticode.

## تفاصيل اختبار Multiview

كان الاختبار يتخطى FFmpeg لأن فحصه السابق لم يكتشف `ffmpeg-static` على Windows. بعد إصلاح ذلك ظهر خلل في عينة الاختبار نفسها: ملف HLS كان يطلب `init.mp4` من مسار لا يحتوي الملف، كما أن عينة VP9/fMP4 لم تكن مناسبة لهذا الاختبار. أصبحت العينة H.264/AVC، ويعمل FFmpeg من مجلد ملفات HLS. أضيف مسار اختياري لتحديد Chrome المثبت عبر `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` عند غياب Chromium في مخزن Playwright.

نتيجة `npm run test:ui` المحلية: **نجح الاختباران**، ولم تُسجل أخطاء JavaScript. شُغّلا باستخدام Chrome المثبت وFFmpeg المضمّن.

## حد الإصدار والنشر

نجحت اختبارات CI وبناء Windows، لكن خطوة توقيع `latest.yml` توقفت لأن سر المستودع `UPDATE_SIGNING_PRIVATE_KEY` غير متوفر. لم تُنشأ مسودة Release، ولم تُرفع ملفات exe؛ النسخ المبنية باقية محلياً في `dist/v2.0.2/`. بعد ضبط السر في GitHub Actions، شغّل **Build PC release draft** من `main` مع الوسم `v2.0.2` لإنتاج المسودة الموقعة.

[نتيجة تشغيل الإصدار على GitHub Actions](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/45957420807)

## حدود التغطية

- لم يُختبر MPEG-DASH مع مزوّد IPTV فعلي، ولا يعلن التطبيق دعم DRM.
- نجاح اختبارات الوسائط المحلية لا يثبت التوافق مع كل خوادم IPTV أو الترميزات أو إعدادات CORS.
- لا يحمل التطبيق توقيع Authenticode تجارياً.

---

# Version 2.0.2 Test Results (English)

**Scope:** Windows x64 source/package version 2.0.2 in the new repository, as of 2026-11-27. Older audit reports are historical records and do not describe this verification run.

## Current results

| Check | Result | Evidence/scope |
|---|---|---|
| Playwright UI Smoke | PASS | PRO navigation, failover, PIN flow, XSS probe, Arabic labels |
| Playwright Multiview | PASS | WebM and H.264 HLS, failover, audio selection, four layouts, persistence, RTL, cleanup |
| GitHub release regressions | PASS | 15 groups: SSRF, net guard, hardening, PRO, PRO IPC, media, classification, secrets audit, backup, update guard, manifest signature, EPG stream, classification parity, player engine, Multiview overlay |
| `npm audit` | PASS | 0 known vulnerabilities across 309 dependencies (0 low/moderate/high/critical) |
| Local Windows build | PASS | NSIS, portable x64, and blockmap created under `dist/v2.0.2/` |
| GitHub Actions Windows build | PASS | Packages built and artifact-presence checks passed |
| GitHub updater-manifest signing | BLOCKED | `UPDATE_SIGNING_PRIVATE_KEY` is not configured; workflow stopped before draft release creation |

## Local build artifacts

| File | Size in bytes |
|---|---:|
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe` | 151,060,265 |
| `GomizPlayer-PRO-IPTV-Portable-2.0.2.exe` | 134,938,997 |
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe.blockmap` | 158,245 |

`dist/latest.yml` identifies version 2.0.2 and matched the Setup size and SHA-512 in the local check. The manifest is unsigned; the Windows executables have no Authenticode signature.

## Multiview test details

The test previously skipped FFmpeg because its detection did not find `ffmpeg-static` on Windows. Enabling FFmpeg exposed a fixture issue: HLS requested `init.mp4` from a directory that did not contain it, and VP9/fMP4 was unsuitable for this test. The fixture now uses H.264/AVC and runs FFmpeg in the HLS output directory. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select installed Chrome when Playwright's managed Chromium is unavailable.

Local `npm run test:ui`: **both UI Smoke and Multiview passed**, with no JavaScript errors, using installed Chrome and bundled FFmpeg.

## Release status and limits

GitHub regression tests, Windows packaging, and artifact checks passed. Signing `latest.yml` failed because the new repository has no `UPDATE_SIGNING_PRIVATE_KEY` Actions secret. No draft release was created and no executable assets were uploaded; the local builds remain in `dist/v2.0.2/`. Add the secret in GitHub Actions, then run **Build PC release draft** on `main` with tag `v2.0.2` to create a signed draft.

[GitHub Actions release run](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/45957420807)

- MPEG-DASH was not tested against a real IPTV provider; DRM support is not claimed.
- Local media tests do not prove compatibility with every provider, codec, or CORS configuration.
- Windows binaries are not Authenticode-signed.
