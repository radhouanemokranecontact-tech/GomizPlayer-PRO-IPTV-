# تقرير الإصلاح والتحقق — GomizPlayer PRO IPTV 2.0.3

**الحالة:** يخص هذا التقرير شيفرة `main` والإصدار 2.0.3. التقرير السابق محفوظ في `docs/archive/REPAIR_REPORT_AR-2.0.0.md`.

## ما أُصلح في هذه الجولة

أخطاء حقيقية تم العثور عليها بالتحليل ومراجعة الشيفرة وإصلاحها:

### الأمان والمنطق في العملية الرئيسية
- **تجاوز قفل التطبيق:** كان `settings:patch` يستطيع مسح `appLockHash` / `appLockPin` دون PIN، مما يلغي حماية الرقابة الأبوية. نُقل تغيير القفل إلى قناة `applock:set` المحمية بـ PIN، وأصبح `settings:patch` يتجاهل حقول القفل تماماً.
- **تلوث النموذج الأولي (prototype pollution):** أسماء الملفات الشخصية `__proto__` / `prototype` / `constructor` كانت تكتب في `Object.prototype`. تُرفض هذه الأسماء الآن، ويُتحقق من الملكية الذاتية في `library()`، وتُستبعد مفاتيح Backup الخطرة.
- **استيراد نسخة احتياطية ناقص:** عند فشل إعادة تشفير كلمات المرور كان يتم حفظ النسخة المستوردة وترك كلمات مرور بوضوح على القرص. أُضيفrollback كامل عند أي فشل.
- **إدخال كلمة مرور Xtream:** كانت تُخزَّن كلمة فارغة ويُبلغ عن نجاح عندما يكون التشفير غير متاح؛ الآن يُطلب تشفير آمن وإلا يُعاد خطأ واضح.
- **تسجيل التسجيلات (recording):** سباق بين مؤقت الفحص المبكر حدث `exit` كان يُبقي حالة التسجيل معلّقة؛ أُصلح بمراقب دائم من لحظة تشغيل ffmpeg.
- **حماية التحديث:** وفاة العارض بعد بدء التطبيق لم تعد تُحسب كانهيار بدء تشغيل وبالتالي لا تظهر عروض rollback خاطئة.
- **فتح التنزيلات:** الملفات في مجلد التنزيلات القديم أو المجلد المسجل في السجل أصبحت قابلة للفتح بعد تغيير `downloadsDir`.
- **EPG بصيغة .gz:** طلب `Accept-Encoding: identity` يمنع فك الضغط مرتين عندما يرسل المزود `Content-Encoding: gzip`.
- **ملخص فحص القنوات:** نتائج `ok: null` تُحسب الآن `unknown` وليس `dead`.
- **تحديث مصدر محذوف:** يُعاد نتيجة منظّمة بدلاً من خطأ IPC غير معالج عند سباق الحذف مع التحديث.

### الواجهة والمشغّل
- زر «إيقاف الترجمة» كان يُعيد تشغيل الترجم فوراً؛ أصبح هناك حالة «إيقاف صريح» (`sub: -1`) تتقدم على تفاصيل التفضيل.
- فهرس مسارات الترجمة الأصلية كان خاطئاً عند وجود مسارات بيانات/فصول قبل الترجمة؛ تُستخدم الآن الفهارس العالمية.
- مفتاح Escape كان يغلق المشغّل **وي**رجع للصفحة الخلفية في آن واحد؛ أصبح المشغّل يتفرد بالمفتاح أثناء فتحه.
- اختيار نوع الوسيط (`stream_type` / `kind`) أصبح مقدّماً على تخمينات الاسم/المجموعة.
- تمرير عنصر للمشغّل وMultiview يستخدم الآن النوع الفعّال `effectiveMediaKind()`.
- نافذة الإدخال `promptModal` كانت تبقى بلا حل عند الإغلاق بـ X أو الخلفية؛ أصبحت تُحلّ بـ `null`.
- تحديث أيقونة المفضلة فورياً كان يفشل للمفاتيح التي تحتوي رموزاً خاصة؛ تُقارن القيم الخام الآن.

### الاختبارات والإصدار
- `sign:manifest` كان يستدعي سكربت التوقيع بدون مفتاح، فيفشل دائماً؛ يقبل الآن مسار المفتاح أو المتغير `UPDATE_SIGNING_PRIVATE_KEY` مع حذف ملف المفتاح المؤقت.
- سكربت الإصدار كان يستخدم الوسم `v2.0.2` كقيمة افتراضية لإصدار موجود؛ أُزيل الافتراضي وأُضيف فحص مبكر لوجود الإصدار.
- اختبار الوسائط كان يمرّ بـ `SKIP` ويعود بنجاح في CI عند غياب ffmpeg؛ أصبح يفشل في CI ويبحث عن ffmpeg في PATH.
- أُضيف اختبار انحدار جديد `npm run test:bugfix` إلى CI وسير الإصدار.
- أُضيفت مجلدات أدوات التحليل العكسي إلى `.gitignore`، وأُصلح رابط Git الذي كان يحتوي رمزاً وهمياً.
- أُصلح اختبار smoke: كان يفشل في خطوة الرقابة الأبوية بعد إضافة شرط PIN، ويُبلغ عن الفشل ثم يعود برمز خروج 0.

## نتائج التحقق المحلية (2026-11-28)

- `npm run test:ssrf / classification / secrets:audit / backup / update-guard / manifest-signature / epg-stream / classification-parity / net-guard / hardening / pro / pro-ipc / media / player-engine / multiview-overlay / bugfix`: **كلها نجحت**.
- `npm run test:secrets` (Electron): نجح.
- `npm run test:ui` (Playwright UI Smoke + Multiview): نجح بلا أخطاء JavaScript.
- `npm run smoke`: `SMOKE_RESULT PASS` ورمز الخروج 0.
- `npm audit`: 0 ثغرات معلنة.
- بناء Windows محلي 2.0.3: نجح (NSIS + Portable + blockmap)، وطابق `dist/latest.yml` الحجم وبصمة SHA-512 لملف Setup.
- `verify:release-manifest` على `dist/latest.yml` المحلي يفشل متوقعاً لأن البيان المحلي غير موقّع؛ البيان الموقّع يُنشأ في CI بالسر `UPDATE_SIGNING_PRIVATE_KEY`.

## حدود
- لم يُختبر البث مع مزوّد IPTV حقيقي؛ لا يُدّعى دعم DRM.
- ملفات Windows غير موقعة Authenticode.

## English

This report covers the current 2.0.3 source. It records real bugs found by analysis and code review, not only documentation changes.

### Fixed
- App lock could be cleared through generic `settings:patch`, bypassing PIN-protected parental controls. Lock changes now go through `applock:set`, which verifies the current PIN.
- `__proto__` / `prototype` / `constructor` profile names could pollute `Object.prototype`; reserved names are rejected and backups are sanitized.
- Backup import could overwrite data and leave plaintext credentials when re-encryption failed; it now rolls back on any failure.
- Xtream password re-entry no longer reports success when secure storage is unavailable.
- Recording state could get stuck due to an `exit` event race; cleanup is now attached immediately.
- Renderer crashes after startup no longer produce false rollback offers.
- Completed downloads in legacy/custom directories remain openable after settings changes.
- `.gz` EPG feeds are no longer decompressed twice.
- Health summary counts `ok:null` probes as unknown, not dead.
- Stale source refresh returns a structured result instead of an unhandled IPC error.
- Subtitles "off" now sticks; native subtitle indices are global; Escape no longer double-navigates; explicit media metadata outranks name/group guessing; Multiview uses effective kind; `promptModal` resolves on close; favorite icon updates work for special characters.
- `sign:manifest` is usable, the release workflow no longer defaults to an existing tag, the media test fails closed in CI, and a new `test:bugfix` regression group was added.

### Verification
All 16 Node regression groups, Electron secrets, Playwright UI smoke + Multiview, and the smoke test passed locally. `npm audit` reported zero vulnerabilities. Local Windows NSIS and portable builds succeeded and the unsigned local `latest.yml` matched the Setup hash/size. The signed manifest is produced by CI with the repository secret; the local unsigned manifest intentionally fails `verify:release-manifest`.
