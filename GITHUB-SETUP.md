# إعداد المستودع والإصدارات

المستودع الرسمي لتطبيق Windows هو:

`https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-`

## استنساخ المشروع

```powershell
git clone https://github.com/radhouanemokranecontact-tech/GomizPlayer-PRO-IPTV-.git
cd GomizPlayer-PRO-IPTV-
npm ci
npm start
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
