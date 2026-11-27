# GomizPlayer IPTV — تقرير مطابقة واجهة Android مع واجهة Windows (99%)
تاريخ: 2026-11-17
الحالة: **تقرير قبل التنفيذ** — لا يوجد أي تغيير في الكود بعد.

---

## 1. الملخص التنفيذي

| البند | الوضع الحالي | المطلوب |
|---|---|---|
| الواجهة الحالية | تطبيق Android «وظيفي» بتخطيط مبسّط (Top tabs + Hero + Rows) | نفس **لغة التصميم** والبنية والمكوّنات والسلوك كما في Windows |
| الفجوة | تقديريًا **35–45% تطابق بصري** بين الواجهتين | **99% تطابق** (نفس الألوان، المقاسات، المواقع، المكوّنات، الحالات) |
| الحكم | Android الحالي تطبيق جيد كوظيفة، **لكنه لا يشبه NovaPlay/Windows** | إعادة بناء طبقة الواجهة بالكامل على نفس النظام التصميمي لـ Windows مع تحسينات TV |

**التكلفة الواقعية للوصول إلى 99%: ~3–4 أسابيع عمل لمطوّر واحد (أو جلسات تنفيذ متتالية أنا أنفذها، كل شاشة تُتحقق بالصور على محاكي TV).**

---

## 2. منهجية المراجعة

- قراءة الكود المصدري للواجهة: `src/renderer/index.html` + `styles.css` (72 KB) + `app.js` (173 KB) + `i18n.js`.
- تشغيل النسخة الرسمية على Windows والتقطيع الآلي لواجهاتها (PNG محفوظة في `screenshots/`):
  - `01-home-ar`, `02-live-ar`, `03-movies-ar`, `03b-downloads-ar`, `04-sources-ar`, `05-settings-ar`, `06-subtitles-ar`, `06b-home-layout-ar`, `07-guide-ar`, `08-detail-ar`, `09-player-ar`, `09b-player-live-ar`, `09c-player-live-drawer-ar`, `10-home-en`, `11-live-en`, `12-settings-en`, `12b-home-layout-en`, `13-home-light-ar`, `14-live-light-ar`, `20..25`.
- مقارنة مباشرة مع لقطات Android الحالي (`Temp\opencode\s5x_*.png`, `poc_*.png`).

---

## 3. نظام التصميم في نسخة Windows (المرجع الرسمي)

### 3.1 رموز التصميم (Design Tokens) — من `styles.css :root`
| الرمز | القيمة (Dark) | القيمة (Light) |
|---|---|---|
| `--bg` | `#080a0f` | `#f4f6fb` |
| `--bg-soft` | `#0d1017` | `#ffffff` |
| `--panel` | `#12161f` | `#ffffff` |
| `--panel-2` | `#171c27` | `#f1f3f9` |
| `--panel-3` | `#1e2432` | `#e7eaf3` |
| `--line` | `rgba(255,255,255,0.08)` | `rgba(10,14,25,0.09)` |
| `--line-strong` | `rgba(255,255,255,0.14)` | `rgba(10,14,25,0.16)` |
| `--text` | `#eef1f7` | `#10141d` |
| `--muted` | `#9aa3b5` | `#5b6478` |
| `--dim` | `#6c7488` | `#7b8497` |
| `--accent` | `#ff3d5a` | `#ff3d5a` |
| `--accent-2` | `#ff7a45` | `#ff7a45` |
| `--accent-soft` | `rgba(255,61,90,0.14)` | `rgba(255,61,90,0.1)` |
| `--ok` | `#38d39f` | — |
| `--warn` | `#ffc857` | — |
| `--danger` | `#ff5d6c` | — |
| `--radius` | `14px` | `14px` |
| `--radius-lg` | `22px` | `22px` |
| `--shadow` | `0 18px 60px rgba(0,0,0,0.55)` | `0 18px 50px rgba(20,30,60,0.16)` |
| Sidebar | `250px` | `250px` |
| الخط | `Segoe UI, Noto Sans Arabic, Dubai, system-ui` | نفس |
| مقياس الخط | `calc(14px * ui-scale)` (80%–140%) | نفس |

- خلفية التطبيق: شعاعان دائريان خفيفان (أحمر 12% + أزرق 14%) فوق `--bg` + تدرج `.main`.
- `.sidebar` خلفية: radial أحمر 13% من الأعلى-اليسار + خطي `#0c0f16 → #090b11`.
- `.topbar` شبه شفاف `rgba(8,10,15,0.72)` + `backdrop-filter: blur(16px)`.
- أزرار أساسية (`btn-primary`): تدرج أحمر برتقالي `#ff3d5a → #ff7a45` (موّن الشاشة `Add source` / `تشغيل`).
- حالات: hover (رفع −1px / تفتيح)، focus-visible (outline أحمر)، active nav item = خلفية `rgba(255,61,90,0.22)` + حد داخلي `0.25`.

### 3.2 هيكل الصفحة (Shell)
```
.app = grid { sidebar 250px | main }
main = topbar (back [مخفي] + searchbox مرنة [max 560px، اختصار /] + TV Guide (زر ghost بأيقونة) + Add source (زر accent))
     + view (المحتوى، padding عربات rows 26px)
```
- **Sidebar**: brand (أيقونة TV في مربع 38px بتدرج accent + اسم GomizPlayer IPTV + tagline) → nav الرئيسية (Home, Live TV, Movies, Series, My List TV, My Movies & Series, Downloads, Recordings) → فاصل → Sources, Settings → footer (chip اللغة EN / avatar ملف شخصي + 3 أيقونات اجتماعية: Facebook, Mail, GitHub).
- **Search**: أيقونة بحث + input + `kbd «/»` يفتح التركيز.

### 3.3 المكوّنات الأساسية (Evidence من اللقطات)
1. **Home widget strip** (3 بطاقات premium قبل الـ Hero مباشرة):
   - بطاقة **Local Time**: نقطة نابضة حمراء + `12:04` + التاريخ تحتها (`15/11/2026` أو `الثالاثاء…`).
   - بطاقة **Weather**: أيقونة الطقس (إيموجي حسب كود Open-Meteo + نهار/ليل) + `20°C` + `Tunis · Cloudy` (الرياح والاتجاه والوصف).
   - بطاقة **Prayer**: أيقونة مسجد (SVG accent) + اسم الصلاة القادمة + العد التنازلي (`Dhuhr 12:04` / `الصلاة القادمة: الظهر 12:04`).
   - التبديل بـ `widgetClock/widgetWeather/widgetPrayer` + `timeFormat 12/24` + `tempUnit C/F` + `prayerMethod` (11 طريقة: ISNA/MWL/Umm Al-Qura…) + `prayerSchool` (Standard/Hanafi) + المدينة (تلقائي `ipwho.is` أو يدوي مع geocoding Open-Meteo) + مصدران مجانيان **بلا مفاتيح**: Open-Meteo للطقس وAladhan `api.aladhan.com/v1/timings` للصلاة + تحديث كل 10 دقائق.
2. **Hero** (`min-height 320px`, radius 22px):
   - خلفية: شعار العنصر (Logo) بحجم cover مع `filter: saturate(1.15)` + طبقات تدرّج (`90deg` مظلم 78%→شفاف + `0deg` من الأسفل) / في RTL ينعكس.
   - حالة `hero-plain` (بدون صورة): radial أحمر/أزرق + تدرّج أزرق عميق.
   - Kicker pill (`جديد / مباشر / …` بخلفية `rgba(255,61,90,0.2)` + حد) + عنوان 34px بوزن 850 + وصف (group · count · مصدر) + زران: **Play** (accent) + **Add to My List** (ghost + قلب).
3. **Section header**: عنوان بوزن 800 + شريط accent رأسي صغير على يمينه + عدّاد + زر `عرض الكل` بأيقونة.
4. **Rows**: أفقية `gap 13px` + scroll-snap + أسهم جانبية تظهر عند hover (RTL-aware) + `view-all`.
5. **Cards** (مقاس قابل للضبط عبر الإعدادات — `compact 132/196 · default 158/232 · large 196/286`):
   - Poster بوستر 2:3 (VOD) أو 16:9 (Live/Wide) + خلفية `radial accent + #1a2233` لو مفقود + **badge** أعلى يمين (LIVE أحمر `card-badge.live` / REC / مصدر) + **شريط تقدم** 3px من الأسفل + **زر قلب** (يظهر عند hover/focus) + overlay Play عند hover (على TV: دائمًا واضح عند التركيز) + meta (`group · source · count`).
6. **Continue Watching**: بطاقات بعرض صورة 2:3 مع شريط تقدم — موجود في Android بالفعل (فقط يلزمه نفس شكل البطاقة).
7. **Live TV**: لا توجد صفحة قائمة مستقلة للمستخدم — **يضغط Live TV → يفتح المشغّل مباشرة على آخر قناة شاهدها + درج القنوات (All channels)** (سلوك state-of-the-art للريموت). الدرج يعرض: بحث + مجموعات + كل القنوات (شعار + اسم + group + **الآن من EPG**) + إخفاء المكررة + «Load more» + **آخر قناة مشتغلة مثبتة في القمة**.
8. **Player chrome** (الهيكل الأهم):
   - `player-top`: زر رجوع + **pill LIVE** (نقطة نابضة) + `latency` (`متأخر 17 ث عن البث`) + `player-top-widget` (ساعة + طقس + صلاة — أزرار ptwClock/ptwWeather/ptwPrayer).
   - `player-bottom` → `player-dock` (18px radius + blur 20px + saturate 1.15 + أسود 55%):
     - `player-identity`: **avatar** (شعار القناة بحجم 42px، خلفية accent) + اسم القناة (15px 800) + **quality chip** (`1080p` / `720p` / `تلقائي`) + `group · الآن من EPG`.
     - **live strip**: `NOW` (tag) + عنوان البرنامج + «باقي NN دقيقة» (حبة blur) + **شريط تقدم أحمر** (يُملأ خطيًا حسب الوقت) + `NEXT` (tag) + العنوان التالي + وقته + **latency pill** + زر `Add EPG` عند غياب EPG.
     - `seek-row` (VOD فقط): `الوقت الحالي / seek bar / الوقت الكلي`.
     - `control-row`: **"كل القنوات"** pill (يفتح الدرج) + transport `back10 · prev · play(أحمر كبير) · stop · next · forward10 · go-live(مخفي في Live) · record(أحمر + badge عدد)` + أدوات: `mute+volume · reload · lock · screenshot · sleep · repeat · seek-step(select 5s–60s) · audio (إن وجدت مسارات) · aspect(ملائمة) · speed(0.25×–2×) · heart(المفضلة) · EPG guide · tracks(صوت/ترجمة) · quick info · mini player · PiP · stats · fullscreen`.
   - حالة `idle` تختفي كل الأشرطة + مؤشر الفأرة. `controls-locked` يعطّل الكل مع opacity 0.55.
   - **خطأ التشغيل**: بطاقة خطأ (⚠) + اسم القناة + السبب + [Retry] [Try next channel] [Close].
   - **REC**: `record-timer` (نقطة حمراء نابضة + «REC» + اسم القناة + مدة) أعلى يمين.
   - **Stats panel** (`S` / زر stats): معدل البت، الدقة، codec، dropped frames…
9. **Favorites**: تحدد كل شيء بالمفاتيح. `My List TV` (بث مباشر فقط) وصفحة `My Movies & Series` (VOD فقط) منفصلة في الدرج. + زر مسح الكل مع **تأكيد نعم/لا**.
10. **Sources**: `pageHead` + زر Import ملف محلي + زر إضافة مصدر + صفوف (شعار + اسم + `M3U/M3U8 · N عناصر · تاريخ آخر تحديث` + أيقونات edit / refresh (مع تأثير spin) / delete — حذف مع **تأكيد نعم/لا**]. + قسم **XMLTV guide**: زر «إضافة دليل برامج» + صف (اسم + المسار/الرابط + refresh + delete).
11. **Downloads**: قائمة صفوف + شريط تقدم + إيقاف/استئناف/إزالة + «مجلد التنزيلات» (قابل للتغيير في الإعدادات).
12. **Settings**: `pageHead` + **قائمة تبويبات رأسية** على الجهة (General, Home, Player, Subtitles, TV Guide, Storage, System, About) + panel بمحتوى منظّم (عناوين فرعية hint تحتها + `switch-row` بمفتاح تشغيل + `segRow` (أزرار قطعة مثل EN/🇫🇷/العربي، داكنة/فاتحة، °C/°F، 12h/24h، 0/Hanafi) + swatches للـ accent (أحمر الافتراضي + 6 ألوان + لون مخصص) + حقل المدينة + زر تحديث الموقع + زر استخدام تلقائي + حفظ) + أنظمة Accessibility: `theme dark/light` + `uiScale 80–140%` + `reduce motion` + `high contrast`.
13. **Welcome / empty states**: brand-mark كبير + عنوان + نقاط بصحّات خضراء + زر إضافة مصدر.
14. **Modals**: backdrop 55% + panel radius 22px + زر إغلاق X + focus trap. (Detail: بوستر + facts + أزرار تشغيل/أضف/تنزيل/افتح + «مقترحة» كـ صف بطاقات.)
15. **Guide (TV Guide)**: modal بملء الشاشة تقريبًا: قائمة قنوات + خلفية البرنامج الحالي/التالي + فلاتر الوقت (الآن / القادمة / 24 ساعة) + بحث.
16. **Toasts** (أسفل يمين): ok أخضر / err أحمر.

---

## 4. المقارنة التفصيلية: Android الحالي × Windows الحالي

| # | المكوّن / الشاشة | Windows (المرجع) | Android الآن | الفجوة |
|---|---|---|---|---|
| 1 | Shell (Sidebar 250px + topbar + view) | Sidebar + topbar + grid | **Top tab bar** بدل Sidebar كامل + لا يوجد topbar/actions | **كبيرة** (البنية كلها مختلفة) |
| 2 | Sidebar | Brand + nav بأيقونات + footer (لغة/ملف/اجتماعي) | لا يوجد — التبويبات أفقية فقط | **كبيرة** |
| 3 | Topbar / Search / TV Guide / Add source | بحث مرن وسط + زرين يمين | لا يوجد | **كبيرة** |
| 4 | Home widget strip | 3 بطاقات premium (ساعة/طقس/صلاة) بأيقونات ونبض | **مفقود تمامًا** | **كبيرة** |
| 5 | Hero carousel | 320px، kicker pill، Add to My List، RTL-mirror، dots بأشرطة 26/40px | يوجد carousel + زر Now playing + dots دائرية (8/22px) | **متوسطة** (يحتاج شكل Windows كامل) |
| 6 | Section headers | شريط accent + عدّاد + view_all | عنوان فقط | **صغيرة–متوسطة** |
| 7 | Rows & cards | 2:3 + hover-lift + badges + progress + fav overlay + play overlay | PosterCard مبسّطة (initials + title + group) | **كبيرة** |
| 8 | Card badges / REC / LIVE / progress | أحمر LIVE + REC أحمر + شريط تقدم + قلب يظهر عند hover | LIVE فقط كنص | **كبيرة** |
| 9 | Continue Watching | صف من بطاقات 2:3 + شريط تقدم | **موجود** (نفس الفكرة، يحتاج ضبط الشكل) | **صغيرة** |
| 10 | Live TV | يفتح آخر قناة في المشغّل + الدرج | صفحة Live مستقلة بفلاتر + بحث | **مختلفة مفاهيميًا** (Windows أفضل للريموت) |
| 11 | Channel drawer في المشغّل | بحث + مجموعات + قائمة + now EPG + dedupe + load more + pinned last channel | **مفقود** | **كبيرة** |
| 12 | Player chrome (dock) | avatar + quality chip + LIVE strip (NOW/NEXT + bar التقدم + latency) + transport + 22 أداة | Media3 controller + عنوان + قلب + EPG text فقط | **كبيرة جدًا** |
| 13 | EPG strip في المشغّل | NOW (عنوان + باقي الوقت كحبة) + **شريط تقدم أحمر** + NEXT (عنوان + وقته) + latency + Add EPG | سطر نصي أحمر ثابت «Now: …» | **كبيرة** |
| 14 | Widgets في top strip للمشغّل | ساعة + طقس + صلاة (أزرار) | لا توجد | **كبيرة** |
| 15 | Player tools (22 زر) | back10/prev/play/stop/next/forward10/golive/record(badge)/mute+vol/reload/lock/screenshot/sleep/repeat/seekstep/audio/aspect/speed/fav/epg/tracks/info/mini/pip/stats/fullscreen | لا توجد (Media3 default) | **كبيرة جدًا** |
| 16 | REC timer overlay | نقطة حمراء نابضة + REC + اسم القناة + المدة | لا يوجد (التسجيل Phase 2) | مفقودة |
| 17 | خطأ التشغيل | بطاقة خطأ + [إعادة المحاولة] [القناة التالية] | رسالة ExoPlayer صامتة على شاشة سوداء | **كبيرة** |
| 18 | Favorites | صفحتا My List (TV) و My Movies & Series + مسح مع تأكيد | تبويبتا My List — **مطابقة مفاهيمية** ✓ | **صغيرة** (الشكل فقط) |
| 19 | Sources view | Import محلي + Refresh مع spinner + dupe الشريط «دليل البرامج» | قائمة + إضافة + حذف + refresh — جيدة لكن أبسط | **متوسطة** |
| 20 | Downloads / Recordings | شاشتان كاملتان | **مفقودتان** | **كبيرة** |
| 21 | Settings | تبويبات رأسية + segRow + swatches + Accessibility (theme, uiScale, motion, contrast) + تحديد الموقع/المدينة + prayer methods | صفحات مسطحة (Profiles/Sources/EPG/Language/About) — جيدة لكن أبسط بكثير | **كبيرة** |
| 22 | Modals | Detail (بوستر + حقائق + 4 أزرار + **«مقترحة»**) + مصدر/ملف | لا توجد | **كبيرة** |
| 23 | TV Guide | مودال بملء الشاشة + فلاتر زمنية + بحث | لا يوجد | **كبيرة** |
| 24 | Subtitles settings | حجم/لون/خلفية/شفافية/موضع/خط/تأخير | لا يوجد | متوسطة |
| 25 | Toasts | أسفل يمين (ok/err) | لا توجد | صغيرة |
| 26 | Welcome / empty states | brand + نقاط صحّات | موجود بفكرة مختلفة ✓ | صغيرة |
| 27 | Light theme | **Dark + Light** | Dark فقط | متوسطة |
| 28 | RTL / i18n | كامل (AR/FR/EN + تخطيط مرآتي + `unicode-bidi` لعناوين الكروت) | **مكتمل** (العربية/RTL مختبرة) ✓ | **مطابقة** |
| 29 | Density (compact/default/large) | من الإعدادات (Home → Card size) | لا توجد | صغيرة |
| 30 | Home layout order/hidden (drag) | قابل لإعادة الترتيب والإخفاء (Hero/Live/Movies/Series/Recent/Groups) | لا توجد | متوسطة |
| 31 | Brand / الشعار | NovaPlay mark = أيقونة TV بـ accent rounded + tagline «Your own player. Your own sources.» + 3 أيقونات اجتماعية | «GomizPlayer IPTV» بخط بلا أيقونة موحدة | **متوسطة** (هوية) |
| 32 | Toasts/Badges مشاكل بصرية | count badge على Live TV (`+5`)… | لا توجد | صغيرة |

**الخلاصة: Android الحالي ≈ 35–45% من الشكل والمكونات. المطابق للوظائف الأساسية ≈ 80%. الفجوة الكبرى = النظام البصري الكامل (sidebar/topbar/widgets/player chrome/drawer/settings/downloads) + Light theme + Settings architecture.**

---

## 5. خطة التنفيذ المقترحة (بدون كتابة كود قبل موافقتك)

### المرحلة UI‑1 — الهيكل ونظام التصميم (Shell + Tokens) — ~4–5 أيام
1. نقل رموز `styles.css` إلى `Theme.kt` حرفًا بحرف (ألوان، خط Segoe/Noto Sans Arabic، أحجام radius 14/22، sidebar 250dp على شكل Vector/Focus الحقيقي).
2. بناء **Sidebar كامل** (Brand + 9 عناصر nav + separator + footer لغة/ملف/3 أيقونات اجتماعية) مع انتقالات focus (رفع 1px + خلفية accent) + topbar (رجوع/بحث/TV Guide/Add source).
3. تبنّي خلفية `.main` (شعاعان gradient) + `.topbar` blur.
4. تفعيل **Light theme** (نفس `data-theme=light` values).
5. تعديل نصوص i18n لمفاتيح Windows (`nav_home`, `nav_live`, …) — مفاتيحنا الحالية قريبة ويكفي إعادة الاستخدام.

### المرحلة UI‑2 — الواجهة الرئيسية والبطاقات — ~4–6 أيام
6. **Home widget strip**: 3 بطاقات premium (Local Time + التاريخ، Weather بإيموجي Open-Meteo، Prayer بأيقونة مسجد + عدّ تنازلي كل ثانية) + Open-Meteo + Aladhan + ipwho.is + إعدادات (city/units/method/school/toggles) — مع toggle في الإعدادات.
7. **Hero** بنفس مقاسات Windows: kicker pill + عنوان 34 + وصف + [Play accent] + [Add to My List ghost] + dots أشرطة 26/40 + RTL مرآة + حالة `hero-plain`.
8. **Section headers** (شريط accent + عدّاد + «عرض الكل») + **card-grid** بنمط `auto-fill minmax` + تمرير سلس.
9. **Cards**: 2:3 مع خلفية ph-radial، badge (LIVE أحمر / REC)، progress 3px، fav heart overlay، play overlay، رفع −3px + ظل عند hover/focus، LIVE بعرض 16:9 (232dp قابل للضغط compact/large).
10. **Continue Watching** بنفس البطاقة مع شريط تقدم (تم أساسًا — يُضبط الشكل).
11. **ترتيب أقسام الرئيسية + الكثافة + الإخفاء** (Home settings: order/hide/density/limit) — سهل الآن مع settingsData الحالي.

### المرحلة UI‑3 — المشغّل والقنوات المباشرة (الأهم) — ~5–7 أيام
12. **Live receiver**: ضغط Live TV يفتح المشغّل على آخر قناة + **الدرج** (All channels) — بحث + مجموعات + now EPG لكل قناة + dedupe + Load more + آخر قناة مثبتة + pin.
13. **Player dock** كامل: avatar (42dp accent) + **quality chip** (AUTO/720/1080/…) + اسم (800) + `group · الآن من EPG` + **شريط NOW/NEXT** مع: tag + العنوان + «باقي NN دقيقة» + **progress bar أحمر يُملأ خطيًا** + NEXT (عنوان + وقت + latency) + زر «أضف EPG».
14. **Top bar للمشغّل**: زر رجوع + pill LIVE نابض + latency (متأخر N ث) + widget (ساعة/طقس/صلاة أزرار بتحديث 10 دقائق).
15. **Transport + Tools كاملة** (~22 زر): back10/prev/play/stop/next/forward10/goLive/record(+badge) + mute+volume/reload/lock/screenshot/sleep/repeat/seekstep(select)/audio/aspect/speed(select)/fav/heart/epg/tracks/info/mini/pip/stats/fullscreen — مع تعطيل المنطقي في Live (إخفاء seek/speed).
16. **خطأ التشغيل**: بطاقة (⚠ + اسم القناة + السبب + [إعادة] [القناة التالية] [إغلاق]).
17. **REC timer** overlay (نقطة نابضة + REC + القناة + مدة) + إحصاءات (stats panel) + `controls-locked` + `idle` (إخفاء بعد 4s).

### المرحلة UI‑4 — الصفحات والإكمال — ~3–4 أيام
18. **Sources** بمظهر Windows: Import محلي (SAF) + «إضافة مصدر» accent + صف (أيقونة سيرفر حمراء + اسم + `M3U/M3U8 · N items · آخر تحديث`) + edit/refresh(spin)/delete (تأكيد **نعم/لا**) + قسم «دليل البرامج» بنفس التخطيط.
19. **Downloads / Recordings** كاملتان: صفوف + شريط تقدم + pause/resume/remove + فتح المجلد (SAF) + نعم/لا للحذف.
20. **Settings بالكامل** ببنية Windows: تبويبات رأسية (General/Home/Player/Subtitles/Guide/Storage/System/About) + `switchRow` toggles + `segRow` (اللغة/الثيم/الوحدة/school) + **swatches accent** (+ اللون المخصص) + **hint** تحت كل عنوان + تحديد الموقع (تلقائي/يدوي + مدينة + حفظ) + **Accessibility** (uiScale/reduce motion/high contrast) + **الثيم Light كامل**.
21. **Modals**: Detail (بوستر + حقائق + 4 أزرار + «مقترحة» صف) + TV Guide (بملء الشاشة + فلاتر الآن/القادمة + بحث).
22. **Welcome/Empty/Toast** بنفس شكل Windows + وعد **التأكيد نعم/لا** على الحذف في كل مكان.

### التحقق في نهاية كل مرحلة
- بناء + تشغيل على محاكي Google TV + **مقارنة بصرية جنبًا إلى جنب مع اللقطات** (`screenshots/…-ar/…-en/…-light`) — نفس الهدف: تطابق ~99%.
- اختبار RTL/العربية + D-pad (كل عنصر قابل للتركيز، لا يوجد فخ فيه).
- عدم كسر الـ data layer الحالية (Store/Repositories/EP​G/Classification) — **تُعاد كتابة UI فقط**.

---

## 6. تكلفة التنفيذ والاقتراح

- **UI-1+2+3+4 ≈ 16–22 يوم** لمطوّر واحد بدوام كامل (معي الجلسة: أسترّسه بشكل 2–4 جلسات طويلة).
- إن أردنا 99% **دون إعادة كتابة كل شيء**: نعتمد **Compose فقط** (لا Jetpack/Views) ونُبقي الـ data layer كما هي — أسرع وأكثر أمانًا.
- الهوية: نحتفظ باسم **GomizPlayer IPTV** (كما طلبه المستخدم: «واجهة GomizPlayer-IPTV») بنفس نظام NovaPlay البصري (لا نغير الشعار ولا الألوان الرسمية).
- على **الهاتف**: نفس التصميم مع تعديل Sidebar → Bottom rail أو rail مدمج؛ لا نحافظ على 99% هناك 100% لكن 95%+ (مقبول ويجب اختياره: sidebar أم bottom nav؟).
- **ما لن نلمسه**: مزود الخدمة/البيانات/Build/الإصدارات — الواجهة تُعاد بناؤها فقط، وبدون أي commit حتى موافقتك.

---

## 7. قرارات أحتاجها منك قبل التنفيذ

1. **البدء من UI-1** مباشرة أم ترتيب مختلف؟
2. **على الهاتف**: Sidebar جانبي مصغّر (rail) أم Bottom navigation؟ (اقتراحي: rail بأيقونات فقط يظهر عند التركيز، يحافظ على لغة التصميم).
3. **NovaPlay logo**: نستورده كما هو (أيقونة TV + تدرّج أحمر) أم نبقيه مع اسم GomizPlayer IPTV فقط؟ (نفس الأيقونة والخط — الاسم يبقى ملكك).
4. **Theme Light**: مهم الآن أم بعد إكمال Dark 99%؟
5. **الهاتف**: تفعيل التصميم الجديد عليه معًا (TV+Phone) أم TV أولًا ثم الهاتف؟
6. **Commit**: بعد كل مرحلة UI نضع commit بالتصميم الجديد أم تبقى كل المرحلة بلا commits حتى الانتهاء؟
