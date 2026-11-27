# تقرير الإصلاح والتحقق — GomizPlayer PRO IPTV 2.0.2

**الحالة:** هذا التقرير يخص الشيفرة الموجودة في `main` وإصدار الحزمة 2.0.2، وليس تقرير أرشيف 2.0.0 القديم. حُفظ التقرير السابق في `docs/archive/REPAIR_REPORT_AR-2.0.0.md`.

## ما أُنجز في المتابعة الحالية

- إصلاح اكتشاف FFmpeg في اختبار Multiview على Windows باستخدام `ffmpeg-static` أو FFmpeg الموجود في PATH.
- دعم تشغيل اختبار Playwright بمتصفح Chrome المثبت عبر `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`، مع إبقاء Chromium المُدار من Playwright هو الافتراضي.
- إصلاح عينة HLS في الاختبار: إنشاء ملف التهيئة في مجلد البث واستخدام H.264/AVC بدلاً من عينة VP9 غير المتوافقة مع إعداد fMP4 المستخدم.
- توحيد ملفات الإعداد والتقارير المنشورة لتصف الإصدار 2.0.2 ونتائج الاختبار والبناء الحالية.

هذه إصلاحات لأداة اختبار Multiview وتوثيق المشروع؛ لم يتطلب تشخيص هذه المشكلة تغيير مشغّل التطبيق.

## نتائج التحقق الحالية

- `npm run test:ui`: نجح UI Smoke واختبار Multiview كاملاً، بما في ذلك HLS، التحويل إلى مصدر بديل، تبديل الصوت والتخطيطات، RTL، وتنظيف عناصر الفيديو.
- `npm audit`: صفر ثغرات معلنة ضمن 309 تبعيات.
- GitHub Actions: نجحت اختبارات الانحدار الخمسة عشر وبناء نسختي Windows والتحقق من وجودهما.
- اكتمل البناء المحلي: Setup ‏151,060,265 بايت، Portable ‏134,938,997 بايت، وblockmap ‏158,245 بايت.
- طابق `dist/latest.yml` إصدار 2.0.2 وحجم وبصمة SHA-512 لملف Setup عند فحصه محلياً.

## حالة النشر الحالية

- بعد إضافة سر `UPDATE_SIGNING_PRIVATE_KEY`، نجح [تشغيل GitHub Actions](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/45960310720) في الاختبارات والبناء وتوقيع manifest والتحقق منه.
- نُشر إصدار [v2.0.2 للعامة](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.2) بأصول Setup وPortable وblockmap و`latest.yml` الموقّع.
- بيان `dist/latest.yml` المحلي غير موقّع، ويختلف عن manifest الموقّع المرفق بالإصدار.
- لا يدّعي هذا التحقق تشغيل بث IPTV من مزوّد فعلي أو دعم DRM في MPEG-DASH. ملفات Windows غير موقعة Authenticode.

## English

**Scope:** The current 2.0.2 source and tests, not the old 2.0.0 ZIP audit. The prior report is preserved at `docs/archive/REPAIR_REPORT_AR-2.0.0.md`.

### Work completed in this follow-up
- Fixed Windows FFmpeg discovery in the Multiview test by preferring `ffmpeg-static` and supporting FFmpeg on PATH.
- Added `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` so Playwright can use installed Chrome when its managed Chromium is unavailable.
- Fixed the HLS test fixture: FFmpeg now runs in the HLS output folder so `init.mp4` is served from the expected path; the sample uses H.264/AVC instead of unsuitable VP9/fMP4.
- Updated the release documentation to describe version 2.0.2 and the actual verification/build state.

These are Multiview test-harness and documentation fixes. The diagnosis did not require changing the app's playback implementation.

### Verification
- Local `npm run test:ui`: UI Smoke and all Multiview checks passed.
- `npm audit`: 0 known vulnerabilities across 309 dependencies.
- GitHub Actions: all 15 release regression groups, the Windows build, and artifact-presence checks passed.
- Local NSIS and portable builds completed; `dist/latest.yml` matched the Setup version, size, and SHA-512.

### Current release status
After the `UPDATE_SIGNING_PRIVATE_KEY` secret was added, [GitHub Actions](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/45960310720) passed regression tests, Windows packaging, and manifest signing/verification. The [v2.0.2 release is publicly available](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.2) with Setup, Portable, blockmap, and the signed `latest.yml`.

The local `dist/latest.yml` remains unsigned and is different from the signed CI manifest attached to the release.

MPEG-DASH was not tested against a real provider, DRM is not claimed, and the Windows files do not have Authenticode signatures.
