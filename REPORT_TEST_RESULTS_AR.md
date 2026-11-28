# تقرير نتائج اختبار الإصدار 2.0.4

**النطاق:** نسخة Windows x64 من `GomizPlayer-PRO-IPTV-`، بتاريخ 2026-11-28. يصف هذا التقرير الإصدار الحالي 2.0.4 بعد إصلاحات الأخطاء؛ السجلات الأقدم في Git history هي سجل تاريخي.

## النتائج المحلية

| الفحص | النتيجة | الدليل أو النطاق |
|---|---|---|
| 16 مجموعة اختبار Node | PASS | SSRF، classification، secrets audit، backup، update guard، manifest signature، EPG stream، classification parity، net guard، hardening، PRO، PRO IPC، media، player engine، multiview overlay، bugfix |
| `npm run test:secrets` | PASS | تشفير/فك تشفير آمن، رفض كلمة مرور خاطئة، فشل واضح عند تلف البيانات |
| `npm run test:ui` | PASS | UI Smoke وMultiview عبر Playwright؛ بلا أخطاء JavaScript |
| `npm run smoke` | PASS | `SMOKE_RESULT PASS`، رمز خروج 0، بما في ذلك قفل التطبيق والرقابة الأبوية |
| `npm audit` | PASS | 0 ثغرات معلنة |
| بناء Windows محلي | PASS | NSIS وPortable x64 وblockmap في `dist/v2.0.4/` |
| مطابقة بيان التحديث المحلي | PASS | `dist/latest.yml` يطابق الحجم وبصمة SHA-512 لملف Setup |
| `verify:release-manifest` محلياً | FAIL متوقع | البيان المحلي غير موقّع؛ التحقق يتطلب البيان الموقّع من CI |

## ملفات البناء المحلية

| الملف | الحجم بالبايت |
|---|---:|
| `GomizPlayer-PRO-IPTV-Setup-2.0.4.exe` | 151,061,875 |
| `GomizPlayer-PRO-IPTV-Portable-2.0.4.exe` | 134,947,563 |
| `GomizPlayer-PRO-IPTV-Setup-2.0.4.exe.blockmap` | 158,266 |

ملفات Windows غير موقعة Authenticode، ولهذا قد يعرض Windows تحذير ناشر غير معروف.

## الإصدار على GitHub

| GitHub Actions — CI | PASS | [تشغيل ناجح 46130450678](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/46130450678) |
| GitHub Actions — الإصدار | PASS | [تشغيل ناجح 46130458930](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/46130458930)؛ الاختبارات والبناء والتوقيع والتحقق ورفع الأصول |
| التحقق من بيان CI الموقّع | PASS | `PASS release manifest signature v2.0.4` عند فحص `latest.yml` المرفوع |
| نشر الإصدار | PASS | [إصدار v2.0.4 العام](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.4)؛ 8 أصول |

أصول الإصدار الموقّعة المعتمدة للتحديث: Setup ‏151,061,713 بايت، Portable ‏134,942,995 بايت، blockmap ‏158,291 بايت، و`latest.yml` الموقّع. أضفنا أيضاً نسخ البناء المحلي باللاحقة `-local` و`latest-local-unsigned.yml` للتشخيص فقط؛ بيانها غير موقّع ولا يصلح للتحديث التلقائي. أُصلح أيضاً إصدار v2.0.2 برفع أصوله الأربعة ونشره بعد أن كان مسودة بلا أصول.

## حدود التغطية

- لم يُختبر MPEG-DASH أو البث مع مزوّد IPTV فعلي؛ لا يُدّعى دعم DRM.
- نجاح اختبارات الوسائط المحلية لا يثبت التوافق مع كل خوادم IPTV أو الترميزات أو إعدادات CORS.
- توقيع manifest يمنع التلاعب ببيان التحديث، لكنه لا يستبدل توقيع Authenticode لملفات Windows.

---

# Version 2.0.4 Test Results (English)

**Scope:** Windows x64 build of the current 2.0.4 source, 2026-11-28.

| Check | Result | Evidence/scope |
|---|---|---|
| 16 Node regression groups | PASS | SSRF, classification, secrets audit, backup, update guard, manifest signature, EPG stream, parity, net guard, hardening, PRO, PRO IPC, media, player engine, Multiview overlay, bugfix |
| Electron secrets integration | PASS | Encryption/decryption and clear failure modes |
| Playwright UI smoke + Multiview | PASS | No JavaScript errors |
| Smoke test | PASS | `SMOKE_RESULT PASS`, exit code 0 |
| `npm audit` | PASS | 0 known vulnerabilities |
| Local Windows build | PASS | NSIS, portable x64, blockmap in `dist/v2.0.4/` |
| Local manifest hash/size match | PASS | `dist/latest.yml` matches the Setup artifact |
| Local `verify:release-manifest` | Expected FAIL | Local manifest is unsigned; CI signs it with the repository secret |

| GitHub Actions CI | PASS | [run 46130450678](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/46130450678) |
| GitHub Actions release | PASS | [run 46130458930](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/46130458930): tests, build, signing, verification, asset upload |
| Uploaded CI manifest | PASS | `PASS release manifest signature v2.0.4` |
| Published release | PASS | [v2.0.4](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.4) with 8 assets |

Authoritative signed assets: Setup 151,061,713 bytes, Portable 134,942,995 bytes, blockmap 158,291 bytes, and signed `latest.yml`. The `-local` artifacts and `latest-local-unsigned.yml` are the locally built diagnostic copies and are not for auto-update. The earlier v2.0.2 draft was also repaired: its four verified assets were uploaded and the release published. Windows binaries are not Authenticode-signed. No real IPTV provider or DRM support was tested.
