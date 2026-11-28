# تقرير تشخيص وإصلاح: التنقل بين القنوات وتركيز لوحة المفاتيح

**التاريخ:** 2026-11-28 · **الإصدار المفحوص:** 2.0.4 (قبل البناء/الرفع) · **النطاق:** `src/renderer/player.js`، `src/renderer/styles.css`، `src/main/main.js`

## 1. ما لاحظه المستخدم
「لا يوجد تركيز، تنقلات فوضوية」 عند التنقل بين القنوات في المشغّل.

## 2. إعادة إنتاج حقيقية (قبل الإصلاح)
استخدمتُ Playwright على العارض الحقيقي مع أربع قنوات وهمية، ورصدتُ `document.activeElement` ومفتاح القناة الحالي بعد كل عملية:

| العملية | القناة | العنصر المركّز (قبل) |
|---|---|---|
| فتح المشغّل | a | `BODY` |
| ضغط زر التالي | b | `nextCh` |
| ضغط زر التالي مرة أخرى | c | `nextCh` |
| ضغط زر السابق | b | `prevCh` |
| ضغط `Enter` | **a** (قفزة غير متوقعة من b) | `prevCh` |
| ضغط `d` لفتح قائمة القنوات | b | `prevCh` (لم ينتقل التركيز للقائمة) |
| اختيار قناة من القائمة | b | `BODY` |

كما ظهر أن ضغط `d` كتب الحرف داخل حقل البحث بعد فتح القائمة، فتقلّصت القائمة إلى قناة واحدة (`Channel D`) فقط — أي أن التنقل أصبح فعلياً فوضوياً وغير متوقع.

## 3. الأسباب الجذرية
1. **لا يوجد هدف تركيز ثابت:** `openItem()` لم يكن يركّز عنصر المشغّل؛ لذلك كان التركيز إما `BODY` أو زر التنقل الذي ضُغط.
2. **إعادة تفعيل الزر بـ Enter:** الأزرار احتفظت بالتركيز بعد النقر، فكان ضغط `Enter` يُطلق `click` على زر السابق/التالي مرة أخرى ويثبّ القناة دون سبب.
3. **قائمة القنوات بلا إدارة تركيز:** `toggleDrawer(true)` أعاد بناء القائمة لكنه لم ينقل التركيز إلى حقل البحث؛ و`toggleDrawer(false)` لم يعد التركيز إلى زر القائمة أو المشغّل.
4. **تسريب حرف الاختصار في البحث:** معالجة `d` لم تستدعِ `preventDefault()`، فبعد نقل التركيز إلى `drawerSearch` كُتب الحرف `d` في حقل البحث.
5. **Escape داخل حقل البحث:** كان يكتفي بـ `blur()` ولا يغلق القائمة أو النوافذ المنبثقة.
6. **منطق التالي/السابق غير متسق:** `playNext/playPrev` كانا يبحثان بالـ `key` فقط؛ عند عدم وجود العنصر في القائمة (`idx === -1`) كانا يقفزان إلى أول/آخر قناة، وعند تكرار المفتاح يعيدان نفس القناة. بينما بقية الواجهة تستخدم `sameItem()` (مفتاح أو URL+الاسم).
7. **لا تنقل بلوحة المفاتيح:** الأسهم كانت للبحث/الصوت فقط، ولا يوجد `PageUp/PageDown` لتغيير القناة.
8. **لا مؤشر تركيز مرئي:** عناصر `.ctrl` و`.drawer-item` لم يكن لها `:focus-visible` واضح.
9. **حالة الاختبار متسربة:** فحص `userData` كان يُعيد الكتابة إلى مجلد المستخدم الحقيقي بعد تعيين مجلد الاختبار المؤقت، فتظهر حالة PIN/مرشحات قديمة وتفشل اختبارات متكررة دون سبب حقيقي.

## 4. الإصلاحات
- `player.js`: عنصر `playerRoot` أصبح هدف تركيز (`tabIndex=-1`)، و`focusPlayer()` تُستدعى بعد كل `openItem()`، فتصبح القناة الجديدة دائماً تحت التركيز.
- أزرار `next/prev/Try next` تُبلّر نفسها بعد النقر؛ `Enter` لا يعيد تفعيلها.
- `PageDown/PageUp` و`Ctrl+→/Ctrl+←` يغيرون القناة؛ و`Enter` يبدّل التشغيل/الإيقاف فقط عندما يكون التركيز على المشغّل نفسه.
- فتح القائمة ينقل التركيز إلى `drawerSearch`، و`d` يمنع الكتابة في الحقل، و`Escape` في أي حقل يغلق القائمة/النافذة ويعيد التركيز للمشغّل، وإغلاق القائمة يعيد التركيز إلى زر القائمة عند اللزوم.
- `stepChannel(direction)` يستخدم `sameItem()`، يتخطى التكرارات، ولا يفعل شيئاً إذا لم تكن القناة ضمن القائمة (بدل قفزة عشوائية).
- `setLiveState()` يستخدم `resolvedKind()` بدلاً من `item.kind` الخام، فلا تُعامل قناة مباشرة ببيانات المجموعة فقط كـ VOD.
- `close()` يُعيد التركيز إلى العنصر الذي فتح المشغّل إن كان ما زال موجوداً.
- `styles.css`: مؤشر `:focus-visible` واضح لأزرار المشغّل وعناصر القائمة، مع منع ظهور حلقة حول `playerRoot` الذي يُركّز برمجياً.
- `main.js`: فحص/smoke لا يُعيد توجيه `userData` إلى مجلد المستخدم الحقيقي، فأصبحت الاختبارات قابلة للتكرار.

## 5. التحقق بعد الإصلاح
أضفتُ `npm run test:navigation` (`tools/test-navigation.js`) وهو اختبار Playwright حقيقي يعمل على العارض الفعلي:

```
PASS open focuses the player root
PASS next button advances one channel
PASS next button does not keep focus
PASS second next advances again
PASS prev button goes back one channel
PASS prev button does not keep focus
PASS Enter does not re-trigger the focused nav button
PASS Space does not change channel
PASS PageDown goes to next channel
PASS PageUp goes to previous channel
PASS Ctrl+Right goes to next channel
PASS Ctrl+Left goes to previous channel
PASS d opens the drawer and focuses search
PASS opening drawer with d does not type into search
PASS all four channels are listed
PASS Escape in drawer search closes drawer and restores focus
PASS clicking drawer button focuses search
PASS picking a channel closes drawer and keeps focus on player
PASS no playlist: navigation is a no-op, not a random jump
PASS visible keyboard focus styling exists
PASS no JavaScript errors
ALL NAVIGATION TESTS PASSED
```

كما نجح `npm run test:ui` (UI Smoke + Multiview) و`npm run smoke` (`SMOKE_RESULT PASS`) بعد الإصلاح.

## 6. حدود
- لم يُبناء أي حزمة ولم يُرفع أي شيء إلى GitHub بناءً على طلبك.
- الإصلاحات موجودة في شيفرة المصدر المحلية؛ لم يتم إصدار نسخة جديدة.

---

# English summary

Real Playwright reproduction showed that after opening a channel focus was on `BODY`, after next/prev it stayed on the clicked button, pressing `Enter` re-activated that button and skipped another channel, `d` opened the drawer but typed `d` into the search field (filtering the list to one channel), and picking a channel left focus on `BODY`. Root causes: no stable focus target, buttons retaining focus, missing drawer focus management, missing `preventDefault` on the drawer shortcut, key-only next/prev lookup with random first/last fallback, raw `item.kind` for live state, no keyboard channel shortcuts, and no visible `:focus-visible` styles. All were fixed and verified by `npm run test:navigation`, `npm run test:ui` and `npm run smoke`. No build, no release, no upload was performed.
