# تقرير نتائج اختبار الإصدار 2.0.2

**النطاق:** نسخة Windows x64 من المستودع الجديد `GomizPlayer-PRO-IPTV-`، بتاريخ 2026-11-27. هذا هو التقرير الحالي؛ سجلات التدقيق الأقدم محفوظة عند الحاجة في Git history ولا تمثل نتائج 2.0.2.

## النتائج الحالية

| الفحص | النتيجة | الدليل أو النطاق |
|---|---|---|
| Playwright UI Smoke | PASS | عناصر PRO والتدفق البديل وPIN وXSS والعربية |
| Playwright Multiview | PASS | WebM وHLS H.264، failover، الصوت، 4 تخطيطات، حفظ الحالة، RTL والتنظيف |
| GitHub release regression | PASS | 15 مجموعة: SSRF، net guard، hardening، PRO، PRO IPC، media، classification، secrets audit، backup، update guard، manifest signature، EPG stream، classification parity، player engine، multiview overlay |
| `npm audit` | PASS | 0 ثغرات من 309 تبعيات (0 منخفضة/متوسطة/عالية/حرجة) |
| بناء Windows محلي | PASS | NSIS وPortable x64 وblockmap أُنشئت في `dist/v2.0.2/` |
| بناء Windows في GitHub Actions | PASS | أُنشئت الحزم وتحقق المسار من وجودها |
| توقيع بيان التحديث في GitHub | PASS | توقيع Ed25519 والتحقق من manifest 2.0.2 |
| رفع أصول الإصدار | PASS | أُنشئت مسودة `v2.0.2` ورُفعت إليها الملفات الأربعة |

## ملفات البناء المحلية

| الملف | الحجم بالبايت |
|---|---:|
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe` | 151,060,265 |
| `GomizPlayer-PRO-IPTV-Portable-2.0.2.exe` | 134,938,997 |
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe.blockmap` | 158,245 |

`dist/latest.yml` يحدد الإصدار 2.0.2، وقد طابق الحجم وبصمة SHA-512 لملف Setup في الفحص المحلي. البيان المحلي غير موقّع، وملفات Windows غير موقعة Authenticode.

### أصول GitHub المرفوعة إلى المسودة

| الملف | الحجم بالبايت | الحالة |
|---|---:|---|
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe` | 151,061,611 | uploaded |
| `GomizPlayer-PRO-IPTV-Portable-2.0.2.exe` | 134,937,299 | uploaded |
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe.blockmap` | 158,372 | uploaded |
| `latest.yml` | 661 | uploaded، موقّع ومتحقق منه في CI |

هذه الأحجام تخص بناء GitHub Actions؛ قد تختلف قليلاً عن البناء المحلي بسبب بيانات البناء. المسودة رُفعت لكنها **لم تُنشر للعامة بعد**.

## تفاصيل اختبار Multiview

كان الاختبار يتخطى FFmpeg لأن فحصه السابق لم يكتشف `ffmpeg-static` على Windows. بعد إصلاح ذلك ظهر خلل في عينة الاختبار نفسها: ملف HLS كان يطلب `init.mp4` من مسار لا يحتوي الملف، كما أن عينة VP9/fMP4 لم تكن مناسبة لهذا الاختبار. أصبحت العينة H.264/AVC، ويعمل FFmpeg من مجلد ملفات HLS. أضيف مسار اختياري لتحديد Chrome المثبت عبر `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` عند غياب Chromium في مخزن Playwright.

نتيجة `npm run test:ui` المحلية: **نجح الاختباران**، ولم تُسجل أخطاء JavaScript. شُغّلا باستخدام Chrome المثبت وFFmpeg المضمّن.

## حالة الإصدار والنشر

بعد إضافة سر `UPDATE_SIGNING_PRIVATE_KEY` نجح مسار الإصدار: اختبارات الانحدار، بناء Windows، توقيع `latest.yml` والتحقق منه، وإنشاء مسودة `v2.0.2` مع أصولها الأربعة. المسودة جاهزة للمراجعة لكنها **ليست منشورة للعامة بعد**.

[تشغيل الإصدار الناجح](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/45960310720) · [مسودة الإصدار v2.0.2](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/untagged-e909017985d54179241f)

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
| GitHub updater-manifest signing | PASS | Ed25519 signature created and verified for manifest v2.0.2 |
| GitHub release assets | PASS | Draft `v2.0.2` created with all four assets uploaded |

## Local build artifacts

| File | Size in bytes |
|---|---:|
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe` | 151,060,265 |
| `GomizPlayer-PRO-IPTV-Portable-2.0.2.exe` | 134,938,997 |
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe.blockmap` | 158,245 |

`dist/latest.yml` identifies version 2.0.2 and matched the Setup size and SHA-512 in the local check. The manifest is unsigned; the Windows executables have no Authenticode signature.

### GitHub draft assets

| File | Size in bytes | Status |
|---|---:|---|
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe` | 151,061,611 | uploaded |
| `GomizPlayer-PRO-IPTV-Portable-2.0.2.exe` | 134,937,299 | uploaded |
| `GomizPlayer-PRO-IPTV-Setup-2.0.2.exe.blockmap` | 158,372 | uploaded |
| `latest.yml` | 661 | uploaded; signed and verified by CI |

These are GitHub Actions build sizes and may differ slightly from the local build. The draft has not been publicly published.

## Multiview test details

The test previously skipped FFmpeg because its detection did not find `ffmpeg-static` on Windows. Enabling FFmpeg exposed a fixture issue: HLS requested `init.mp4` from a directory that did not contain it, and VP9/fMP4 was unsuitable for this test. The fixture now uses H.264/AVC and runs FFmpeg in the HLS output directory. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select installed Chrome when Playwright's managed Chromium is unavailable.

Local `npm run test:ui`: **both UI Smoke and Multiview passed**, with no JavaScript errors, using installed Chrome and bundled FFmpeg.

## Release status and limits

After the `UPDATE_SIGNING_PRIVATE_KEY` secret was added, the release workflow passed regressions, Windows packaging, Ed25519 manifest signing/verification, and draft asset upload. Draft `v2.0.2` contains all four assets and is **not yet publicly published**.

[Successful GitHub Actions run](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/45960310720) · [Draft release v2.0.2](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/untagged-e909017985d54179241f)

- MPEG-DASH was not tested against a real IPTV provider; DRM support is not claimed.
- Local media tests do not prove compatibility with every provider, codec, or CORS configuration.
- Windows binaries are not Authenticode-signed.
