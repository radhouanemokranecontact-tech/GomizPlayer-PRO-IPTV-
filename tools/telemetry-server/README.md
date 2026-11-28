# GomizPlayer IPTV Telemetry Dashboard (محلي/قابل للنشر)

خادم استقبال ولوحة عرض (بدون اعتماديات خارجية) لتحليلات GomizPlayer IPTV وتقارير الأعطال.

## الميزات
- **ملخصات:** إجمالي الأحداث، تثبيتات فريدة (تقريبية)، نشط 24س/7أيام، مرات التشغيل، أول تشغيل، نبضات النشاط، الأخطاء/الأعطال.
- **رسوم وتحليل زمني:** الأحداث حسب اليوم، توزيع الأنواع/الإصدارات/المنصات، وخريطة نشاط ساعي (heatmap).
- **تفاصيل لكل تثبيت/جلسة (Drill-down):** الضغط على Install ID يعرض جلساته وأحداثه وربط الأخطاء بالأحداث.
- **تنبيهات:** كشف ارتفاع مفاجئ في الأخطاء (spike) وعرض تنبيه في اللوحة و`/api/summary`.
- **أخطاء:** أكثر الأخطاء تكراراً (مجمّعة) + الأخطاء الأخيرة مع الرسالة وتتبع المكدس.
- **فلاتر وتحكم:** نطاق زمني، بحث، تحديث تلقائي، **حفظ الفلاتر** (محلياً في المتصفح)، وترقيم صفحات للجداول.
- **تصدير وتقارير:** تصدير ملخص JSON، تصدير CSV للأخطاء/الأحداث، وتقرير دوري JSON (`/api/report`).
- **حماية الوصول والنشر:** دعم رمز/توكن أو Basic Auth، ودعم HTTPS (عبر شهادات).

> "المستخدمون الفريدون/النشطون" تقديري بناءً على `installId` المجهول والأحداث المستلمة.

## التشغيل
```bat
node tools\telemetry-server\server.js
```
افتراضياً: `http://localhost:8787`
- اللوحة: `/`
- الاستقبال (POST JSON): `/ingest` (يدعم حدثاً أو `{events:[...]}`)
- ملخص: `/api/summary?range=7d&q=...`
- تفاصيل تثبيت: `/api/install?id=<installId>`
- أحداث خام: `/api/events`
- تصدير: `/api/export/errors.csv?range=7d`, `/api/export/events.csv?range=7d`
- تقرير دوري: `/api/report?range=7d`
- صحة: `/health`

## المتغيرات (اختياري)
- `PORT`, `HOST` — المنفذ/العنوان
- `TELEMETRY_TOKEN` — رمز حماية (يُقبل كـ `Authorization: Bearer <token>` أو `X-Telemetry-Token` للوحة/API والاستقبال عند تفعيله)
- `DASH_USER`, `DASH_PASS` — حماية Basic Auth للوحة/API
- `SSL_KEY`, `SSL_CERT` — مسارات ملفات الشهادة والمفتاح لتشغيل HTTPS

أمثلة:
```bat
set PORT=8787 && node tools\telemetry-server\server.js
set TELEMETRY_TOKEN=secret123 && node tools\telemetry-server\server.js
set DASH_USER=admin && set DASH_PASS=pass && node tools\telemetry-server\server.js
set SSL_KEY=key.pem && set SSL_CERT=cert.pem && node tools\telemetry-server\server.js
```

## ربط GomizPlayer IPTV بالخادم
1. شغّل الخادم.
2. في GomizPlayer IPTV: **الإعدادات > الخصوصية والأمان** → فعّل/وافق على التحليلات وتقارير الأعطال.
3. اضبط **عنوان خدمة الإحصاءات** إلى `http://HOST:PORT/ingest` (أو HTTPS).  
   - إذا فعّلت حماية التوكن على الاستقبال، استخدم نقطة استقبال خلف وكيل يضيف الترويسة أو عدّل العميل؛ الوضع الافتراضي بدون توكن يعمل مباشرة.

## البيانات والخصوصية
- التخزين: `tools/telemetry-server/data/events.jsonl`
- للاستخدام التجريبي/المحلي. للإنتاج: فعّل HTTPS والمصادقة، قيّد الوصول، وحدد سياسة احتفاظ/خصوصية، واجمع الحد الأدنى من البيانات مع إبلاغ المستخدمين وخيارات التعطيل.
