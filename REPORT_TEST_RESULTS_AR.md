# تقرير نتائج اختبار الإصدار 2.0.4

**النطاق:** نسخة Windows x64 من `GomizPlayer-PRO-IPTV-`، بتاريخ 2026-11-28. يصف التقرير الإصدار الحالي 2.0.4 بعد فصل الرقابة الأبوية عن قفل التطبيق.

## الاختبار الحقيقي قبل البناء

| الفحص | النتيجة | الدليل أو النطاق |
|---|---|---|
| 16 مجموعة اختبار Node | PASS | SSRF، classification، secrets audit، backup، update guard، manifest signature، EPG stream، classification parity، net guard، hardening، PRO، PRO IPC، media، player engine، multiview overlay، bugfix |
| `npm run test:secrets` | PASS | تشفير/فك تشفير آمن، رفض كلمة مرور خاطئة، فشل واضح عند تلف البيانات |
| `npm run test:ui` | PASS | Playwright UI Smoke + Multiview؛ بلا أخطاء JavaScript |
| `npm run smoke` | PASS | `SMOKE_RESULT PASS` ورمز خروج 0، مع `parental-pin-set:ok` و`pro-parental-set:ok` و`parental-pin-clear:ok` |
| `npm audit` | PASS | 0 ثغرات معلنة |

**اختبارات PIN الرقابة الأبوية تحديداً (REAL):**
- `parental enable without a parental PIN is rejected` — PASS
- `parental PIN can be set without any app lock` — PASS
- `parental PIN verifies` / `wrong parental PIN rejected` — PASS
- `changing parental PIN needs current PIN` — PASS
- `parental enable with its own PIN succeeds` — PASS
- `disabling needs correct parental PIN` / `correct PIN disables and restores` — PASS
- `parental PIN can be cleared with current PIN` — PASS
- Playwright: `parental PIN field visible`، `parental PIN management visible`، `parental hint is independent of app lock`، `parental save called` — PASS

## البناء والتحقق المحلي

| الفحص | النتيجة | الدليل |
|---|---|---|
| بناء Windows محلي | PASS | NSIS وPortable x64 وblockmap في `dist/v2.0.4/` |
| مطابقة البيان المحلي | PASS | `dist/latest.yml` (الإصدار 2.0.4) يطابق الحجم وSHA-512 لملف Setup |
| `verify:release-manifest` محلياً | FAIL متوقع | البيان المحلي غير موقّع؛ الموقّع يُنتَج في CI |

| الملف المحلي | الحجم بالبايت |
|---|---:|
| `GomizPlayer-PRO-IPTV-Setup-2.0.4.exe` | 151,261,764 |
| `GomizPlayer-PRO-IPTV-Portable-2.0.4.exe` | 134,943,122 |
| `GomizPlayer-PRO-IPTV-Setup-2.0.4.exe.blockmap` | 158,519 |

## GitHub Actions والنشر

| الفحص | النتيجة | الدليل |
|---|---|---|
| CI | PASS | [تشغيل 46133796401](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/46133796401) |
| سير الإصدار | PASS | [تشغيل 46133811286](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/46133811286): اختبارات، بناء، توقيع، تحقق، رفع أصول |
| بيان CI الموقّع | PASS | `PASS release manifest signature v2.0.4` |
| نشر الإصدار | PASS | [إصدار v2.0.4 العام](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.4) بـ 8 أصول |

أصول التحديث المعتمدة: Setup ‏151,064,651 بايت، Portable ‏134,944,004 بايت، blockmap ‏158,184 بايت، و`latest.yml` الموقّع. نسخ البناء المحلي مرفوعة باللاحقة `-local` و`latest-local-unsigned.yml` للتشخيص فقط.

## حدود التغطية

- لم يُختبر البث مع مزوّد IPTV فعلي؛ لا يُدّعى دعم DRM.
- نجاح اختبارات الوسائط المحلية لا يثبت التوافق مع كل الخوادم أو الترميزات أو إعدادات CORS.
- توقيع manifest لا يستبدل توقيع Authenticode؛ ملفات Windows غير موقّعة.

---

# Version 2.0.4 Test Results (English)

**Scope:** Windows x64, 2026-11-28. Parental controls now use a dedicated PIN, fully independent of the Settings app lock.

| Check | Result | Evidence |
|---|---|---|
| 16 Node regression groups | PASS | SSRF, classification, secrets audit, backup, update guard, manifest signature, EPG, parity, net guard, hardening, PRO, PRO IPC, media, player engine, Multiview overlay, bugfix |
| Electron secrets | PASS | Encryption/decryption and failure modes |
| Playwright UI smoke + Multiview | PASS | No JavaScript errors |
| Smoke test | PASS | `SMOKE_RESULT PASS`, exit 0, parental PIN steps ok |
| `npm audit` | PASS | 0 known vulnerabilities |
| Local Windows build | PASS | NSIS, portable, blockmap under `dist/v2.0.4/`; unsigned `latest.yml` hash/size matches Setup |
| Local `verify:release-manifest` | Expected FAIL | Local manifest is unsigned |
| GitHub Actions CI / release | PASS | [CI](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/46133796401) · [release](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/actions/runs/46133811286) |
| Uploaded signed manifest | PASS | `PASS release manifest signature v2.0.4` |
| Public release | PASS | [v2.0.4](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-/releases/tag/v2.0.4), 8 assets |

Dedicated parental PIN checks (set without app lock, verify, wrong PIN, change protection, enable/disable protection, clear) and the Playwright UI checks for the PIN management controls all passed. Windows binaries are not Authenticode-signed; no real IPTV provider or DRM support was tested.
