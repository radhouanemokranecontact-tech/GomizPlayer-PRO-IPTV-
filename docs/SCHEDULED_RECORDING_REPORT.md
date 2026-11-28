# تقرير شامل: التسجيل المجدول لا يظهر في «التسجيلات» إلا بعد إعادة التشغيل

**التاريخ:** 2026-11-28 · **الإصدار المفحوص:** 2.0.4 (شيفرة المصدر) · **طريقة الفحص:** تشغيل التطبيق الحقيقي مباشرة (بإذن من المستخدم) باستخدام Electron مع `user-data-dir` معزول، وربط Playwright عبر CDP، وبث MPEG-TS محلي يُرسل في الزمن الحقيقي (`ffmpeg -re`).

## 1. إعادة إنتاج المشكلة (قبل الإصلاح)
تم جدولة تسجيل باسم `SchedTest` من بث TS محلي، ومراقبة الحالة والملفات والواجهة أثناء التشغيل دون إغلاق التطبيق:

| الفحص | النتيجة قبل الإصلاح |
|---|---|
| قبول الجدولة | PASS |
| بدء التسجيل في موعده (`state=recording`) | PASS |
| إنهاء التسجيل (`state=done`) | PASS |
| ملف التسجيل موجود على القرص بحجم > 0 | PASS |
| توقف ffmpeg عند وقت الانتهاء (حجم الملف مستقر) | PASS |
| **ظهور الملف في صفحة «التسجيلات» دون إعادة تشغيل** | **FAIL** — القائمة بقيت تعرض ملفين قديمين فقط، و`SchedTest` لم يظهر |

هذا يطابق تماماً ما ذكره المستخدم: التسجيل يتم فعلياً ويُحفظ على القرص، لكن «خانة التسجيلات» لا تتحدث إلا بعد غلق التطبيق وفتحه من جديد.

## 2. السبب الجذري
- `Scheduler.tick()` كان يحدّث `store.data.schedules` ويحفظه عند تغيير الحالة، لكنه **لا يرسل أي إشعار إلى العارض**.
- `state.recordings` في `app.js` يُحمّل مرة واحدة عند بدء التطبيق (`refreshRecordings()` في التهيئة) أو عند تحديث يدوي (`__novaTest.reload` / زر التحديث).
- التنقل إلى صفحة «التسجيلات» يعرض `state.recordings` المخزّن مؤقتاً دون استدعاء `window.api.recording.list()` مجدداً.
- النتيجة: الملف موجود على القرص، لكن الواجهة تنتظر تحديثاً لم يصل.

ملاحظة: تم التحقق أيضاً من أن منطق `stopRecording(e.file)` و`isRecording(e.file)` في `pro/ipc.js` سليم (يمرّر مسار الملف لا كائن الجدولة)، وأن `stopRecordingInternal()` يقتل العملية وينتظر خروجها — لم يكن هذا هو السبب.

## 3. الإصلاح
1. `src/main/pro/scheduler.js`: أُضيف خيار `onStateChange` يُستدعى بعد كل حفظ لتغيير الحالة (start/done/failed/missed).
2. `src/main/pro/ipc.js`: عند إنشاء `Scheduler` يُمرّر `onStateChange: (items) => sendWin('pro:schedule:changed', { items })`.
3. `src/main/preload.js`: أُضيف `pro.sched.onChanged(cb)` للاشتراك في الحدث وإلغاء الاشتراك.
4. `src/renderer/app.js`: مستمع واحد للحدث يستدعي `refreshRecordings()`، فيُحدَّث `state.recordings` والشارة والصفحة فوراً.

## 4. التحقق بعد الإصلاح (اختبار حقيقي)
```
PASS schedule accepted
PASS recording started on schedule
PASS scheduler marks entry done
PASS file exists in recording folder without restart
PASS Recordings page shows the new file without restart
PASS recording stopped at end time
PASS no app errors
ALL SCHEDULED RECORDING TESTS PASSED
```
أُضيف الاختبار كـ `npm run test:scheduled-recording` في `tools/test-scheduled-recording.js`.

اختبارات انحدار إضافية نجحت بعد التعديل:
- `npm run test:pro` — PASS
- `npm run test:pro-ipc` — PASS
- `npm run test:bugfix` — PASS
- `npm run test:navigation` — PASS
- `npm run test:ui` (UI Smoke + Multiview) — PASS

## 5. حدود وملاحظات
- المجدول يعمل بدقة خطوة 15 ثانية (`tickMs`)؛ بدء/انتهاء التسجيل قد يتأخر حتى 15 ثانية عن الوقت المحدد، وهو سلوك تصميمي قائم لم يتغير.
- الفحص استخدم بث TS محلياً مستقراً؛ لم يُختبر مع مزوّد IPTV حقيقي أو انقطاع الشبكة أثناء التسجيل.
- لم يُنشأ بناء جديد ولم يُرفع أي شيء إلى GitHub في هذه المهمة؛ الإصلاحات محفوظة محلياً.

---

# English summary

Real-app reproduction confirmed that the scheduled recording actually started, was marked `done`, produced a non-empty file on disk and ffmpeg stopped at the scheduled end — but the Recordings page still showed only the old cached list until the app was restarted. Root cause: the scheduler persisted state changes without notifying the renderer, and `state.recordings` was only loaded at startup or manual reload. Fix: `Scheduler` now calls an `onStateChange` hook after saving; `pro/ipc.js` emits `pro:schedule:changed`; preload exposes `pro.sched.onChanged`; `app.js` calls `refreshRecordings()` on that event. All seven real-app assertions and all existing regression suites pass. No build or upload was performed.
