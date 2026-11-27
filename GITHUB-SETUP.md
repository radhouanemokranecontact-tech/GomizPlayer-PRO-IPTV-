# إعداد المستودع والإصدارات

المستودع الرسمي لتطبيق Windows هو:

`https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-`

## استنساخ المشروع

```powershell
git clone https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-.git
cd GomizPlayer-PRO-IPTV-
npm.cmd ci
npm.cmd start
```

يستبعد `.gitignore` مجلدي `node_modules/` و`dist/` ومخرجات البناء والملفات التنفيذية. تُحفظ ملفات المصدر والوثائق والاختبارات في Git، أما ملفات التثبيت فترفع كأصول لإصدار GitHub.

## فحوصات وبناء Windows

```powershell
npm run test:ui
npm audit
npm run dist
```

ينشئ `npm run dist` مثبّت NSIS ونسخة Portable x64 داخل `dist/v<version>/`، ويحدّث `dist/latest.yml`. تتطلب اختبارات الواجهة Playwright وChromium؛ يمكن تحديد متصفح Chrome المثبت عبر متغير البيئة `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## إصدار تحديث موقّع

1. حدّث رقم الإصدار في `package.json` و`package-lock.json`، ثم شغّل الاختبارات والبناء.
2. اضبط سر المستودع `UPDATE_SIGNING_PRIVATE_KEY` بمفتاح Ed25519 المطابق للمفتاح العام المضمّن في التطبيق. لا تحفظ المفتاح الخاص في ملفات المشروع أو Git.
3. افتح GitHub Actions واختر **Build PC release draft** ثم **Run workflow** على `main`، وأدخل وسم الإصدار المطابق، مثل `v2.0.2`.
4. يتحقق المسار من الاختبارات ورقم الإصدار، يبني NSIS وPortable، يوقّع `latest.yml`، ويتحقق من التوقيع ثم ينشئ إصداراً مسودة يتضمن المثبّت والنسخة المحمولة وملف blockmap والبيان الموقّع.
5. راجع المسودة وأصولها قبل نشرها. ملفات Windows لا تحمل توقيع Authenticode حالياً؛ قد يعرض Windows تحذير ناشر غير معروف.

إذا لم يكن السر مضبوطاً، يفشل مسار الإصدار عمداً ولا ينشر بيان تحديث غير موقّع.

## English

The official Windows repository is [GomizPlayer-PRO-IPTV-](https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-).

### Clone and run

```powershell
git clone https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-.git
cd GomizPlayer-PRO-IPTV-
npm.cmd ci
npm.cmd start
```

`.gitignore` excludes `node_modules/`, `dist/`, build output, and executables. Source, tests, and documentation belong in Git; installers are release assets.

### Test and build

```powershell
npm run test:ui
npm audit
npm run dist
```

`npm run dist` builds NSIS and x64 portable packages under `dist/v<version>/` and writes `dist/latest.yml`. UI tests require Playwright plus Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use installed Chrome if Playwright's managed Chromium is unavailable.

### Signed release workflow

1. Update both `package.json` and `package-lock.json`, then run the tests and build.
2. Configure the repository Actions secret `UPDATE_SIGNING_PRIVATE_KEY` with the Ed25519 private key matching the public key embedded in the app. Never put the private key in the repository or chat.
3. In GitHub Actions, run **Build PC release draft** on `main`, entering a tag that matches the package version, for example `v2.0.2`.
4. The workflow runs regression tests, builds Windows packages, signs and verifies `latest.yml`, and creates a draft release containing Setup, Portable, blockmap, and the signed manifest.
5. Review the draft and its assets before publishing. Windows executables currently have no Authenticode signature, so Windows may show an unknown-publisher warning.

The current 2.0.2 source and packages are verified, but the new repository's signing secret is not configured yet. Until it is added, the workflow intentionally stops before creating a release.
