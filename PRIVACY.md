# سياسة الخصوصية — GomizPlayer IPTV

آخر تحديث: 2026-11-27

يوضح هذا المستند كيفية تعامل GomizPlayer IPTV مع البيانات عند استخدام الميزات الاختيارية للتشخيص/القياس.

## 1) ما الذي قد نجمعه (عند تفعيل الميزات)
عند تفعيل تحليلات الاستخدام و/أو تقارير الأعطال قد يرسل التطبيق إلى نقطة الاستقبال المُعدّة:
- **تحليلات استخدام مجهولة:** أحداث مثل التشغيل، أول تشغيل، نبض النشاط؛ معرّف تثبيت عشوائي (`installId`) ومعرّف جلسة (`sessionId`)؛ إصدار التطبيق؛ نظام التشغيل/المنصة والمعمارية واللغة والتوقيت.
- **تقارير الأعطال/الأخطاء:** نوع الحدث ورسالة الخطأ وتتبع المكدس (stack trace) مع معلومات الإصدار/المنصة والتوقيت، للمساعدة في تشخيص المشاكل.

## 2) ما الذي لا نجمعه
- لا نجمع عناوين MAC، ولا كلمات المرور، ولا بيانات حساباتك.
- لا نجمع قوائم التشغيل أو المحتوى أو الملفات الشخصية أو وسائطك.
- لا نستخدم هذه البيانات للتعرّف على هويتك الشخصية.

## 3) عنوان IP والاتصال بالشبكة
عند إرسال أي طلب إلى خادم الاستقبال قد يكون عنوان IP الخاص بك مرئياً للخادم تقنياً (كما هو الحال في أي اتصال إنترنت). يعتمد تخزين/معالجة هذه البيانات على مشغّل نقطة الاستقبال.

## 4) التحكم والاختيار
- يمكنك تفعيل أو إيقاف "تحليلات الاستخدام" و"تقارير الأعطال" في أي وقت من: **الإعدادات > الخصوصية والأمان** داخل التطبيق.
- يمكنك تغيير "عنوان خدمة الإحصاءات" أو إيقاف الإرسال بالكامل.
- يتم حفظ سجلات أخطاء محلية على جهازك ضمن مجلد بيانات التطبيق (`userData/logs/app.log`).

## 5) الخدمات الخارجية
قد يستخدم التطبيق خدمات/واجهات خارجية لتوفير وظائف مثل الطقس/الصلاة أو التحديثات/القياس وفق إعداداتك. تنطبق سياسات تلك الخدمات على طلباتك المرسلة إليها.

**تحديد الموقع الجغرافي (ipwho.is):**
- عند عدم إدخال مدينة يدوياً، يرسل التطبيق طلباً إلى `https://ipwho.is/` عند الإقلاع لتحديد موقعك التقريبي (المدينة/الدولة) من عنوان IP، لعرض الطقس وأوقات الصلاة.
- يُرسل **عنوان IP فقط** تقنياً — لا يُرسل اسمك أو بيانات حسابك أو قوائمك. لا نخزّن هذه المعلومات على خوادمنا (لا يوجد خادم لدينا لهذا الغرض).
- **لتجنّب هذا الطلب:** افتح الإعدادات ← عام ← أدخل اسم المدينة يدوياً (`Source city`)؛ عندها لن يُستدعى ipwho.is إطلاقاً.
- بدائل الخدمة: Open-Meteo (الطقس) و Aladhan (أوقات الصلاة) — كلاهما مجاني بلا مفتاح API، وتنطبق سياساتهما على طلباتك.

**English:** When no city is configured, the app calls `https://ipwho.is/` on startup to approximate your location (city/country) from your IP for weather and prayer times. Only your IP is technically transmitted; no name, account, or playlist data. To opt out, set a city manually in Settings → General.

## 6) الاحتفاظ والأمان
- البيانات المرسلة تُعالج وتُخزّن وفق إعداد خادم الاستقبال الذي تختاره/يشغّله موزّع التطبيق. للإنتاج يُنصح باستخدام HTTPS والمصادقة وتقييد الوصول والاحتفاظ بالحد الأدنى اللازم.
- لا يمكن ضمان أمان مطلق لأي نقل بيانات عبر الشبكة.

## 7) التواصل
للأسئلة أو طلبات الخصوصية المتعلقة بهذه النسخة/التوزيع، تواصل مع مسؤول/موزّع الإصدار عبر صفحة المستودع أو قناة الدعم الخاصة به.

## 8) التحكم عن بُعد (LAN)
- **غير متاح في هذا الإصدار.** لا يفتح التطبيق أي خادم محلي ولا يستمع على أي منفذ. (كانت نسخ سابقة من هذا المستند تذكر ميزة تحكم عن بُعد؛ لم تُنفَّذ في الكود وتمت إزالة الإشارة.)

---

# Privacy Policy — English

**Last reviewed:** 2026-11-27

This policy describes optional diagnostics/analytics and network requests in GomizPlayer PRO IPTV 2.0.2.

## 1. Data that may be sent

When enabled, usage analytics and/or crash reporting may send to the configured receiver:
- Usage events, a random installation ID and session ID, app version, platform/OS, architecture, language, and time.
- Error type, error message, and stack trace with version/platform/time details.

## 2. Data not collected by these features

The app's analytics/crash reports are not intended to send MAC addresses, passwords, account credentials, playlists, media files, profiles, or viewing content. The reports can include technical error details and stack traces, so review your receiver configuration and logs.

## 3. Network and IP address

The receiving server can technically see your IP address when the app connects. The server operator determines whether and how connection data is retained.

## 4. User controls and local logs

- Analytics and crash reporting can be enabled or disabled in **Settings → Privacy & Security**.
- The telemetry service URL can be changed or telemetry can be disabled.
- Local diagnostic logs are stored under the app's `userData/logs/app.log` directory.

## 5. External services

Weather, prayer times, location lookup, and app updates may contact external services. Their policies apply to requests they receive.

When no city is configured, the app requests `https://ipwho.is/` to estimate a city/country from the IP address for weather and prayer-time widgets. The request necessarily exposes the IP to that service. To avoid the IP-based lookup, set a city manually in **Settings → General**. Weather data uses Open-Meteo; prayer-time data uses Aladhan. Their privacy policies apply to those requests.

## 6. Retention and security

Data sent to telemetry is handled according to the endpoint you configure or the distributor's receiver. Production endpoints should use HTTPS, authentication, restricted access, and limited retention. No network transfer can be guaranteed absolutely secure.

## 7. Contact

For privacy questions about a distribution, contact its maintainer through the repository or its support channel.

## 8. LAN remote control

LAN remote control is **not available** in this version. The app does not start a local control server or listen on a local port.
