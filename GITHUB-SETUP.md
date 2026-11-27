# رفع GomizPlayer IPTV على GitHub وتحديثه مستقبلاً

هذا الملف يجهّزك لرفع المشروع بعد تثبيت Git.

## 1) المتطلبات (مرة واحدة)
- تثبيت **Git for Windows**: https://git-scm.com/download/win
- إنشاء حساب/تسجيل الدخول على **GitHub**: https://github.com/
- (اختياري للتطوير/البناء) Node.js و npm مثبتان.

> ملاحظة: المجلدان `node_modules/` و`dist/` مستبعدان عبر `.gitignore` ولن يتم رفعهما (وهذا صحيح).

## 2) إنشاء المستودع على GitHub
1. افتح GitHub → **New repository**.
2. اختر اسم المستودع (مثلاً `GomizPlayer-IPTV`).
3. لا تُفعّل إضافة README أو .gitignore أو License (موجودة محلياً).
4. انسخ رابط المستودع، مثل: `https://github.com/<USERNAME>/GomizPlayer-IPTV.git`

## 3) الرفع الأول (بعد تثبيت Git)
افتح **PowerShell** أو **CMD** داخل مجلد المشروع:
`C:\Users\Radhouanemokrane\Documents\Projet par défaut\netfly-clone`

نفّذ الأوامر التالية:

```bat
git init
git add .
git commit -m "Initial commit: GomizPlayer IPTV"
git branch -M main
git remote add origin https://github.com/<USERNAME>/<REPO>.git
git push -u origin main
```

- استبدل `<USERNAME>` و`<REPO>` بالقيم الصحيحة.
- عند الطلب، سجّل الدخول إلى GitHub (يفضّل **Personal Access Token** أو Git Credential Manager).
- للتحقق من الحالة لاحقاً: `git status`

## 4) تحديث الكود على GitHub (بعد أي تعديل)
```bat
git add .
git commit -m "وصف التعديل"
git push
```

## 5) إصدار نسخة جديدة من التطبيق (.exe) للمستخدمين
المشروع مُجهّز بـ electron-builder (سكربت `dist`).

1. حدّث رقم الإصدار في `package.json` (مثلاً `1.0.1`).
2. ابنِ الحزم (من CMD أو PowerShell، وإن لزم استخدم `cmd /c`):
```bat
cmd /c npm install
cmd /c npm run dist
```
3. ستجد الملفات في `dist/`:
   - `GomizPlayer IPTV Setup <version>.exe` (مثبّت)
   - `GomizPlayer IPTV <version>.exe` (Portable)
4. على GitHub أنشئ **Release** جديد:
   - Tag مثل `v1.0.1`
   - ارفع ملفات `.exe` (من `dist/`) في Assets
   - اكتب ملاحظات الإصدار ثم انشره

> هذا يوفر تحديثاً **يدوياً** (المستخدم يحمّل النسخة الجديدة). التحديث التلقائي داخل التطبيق (electron-updater) يحتاج إعداداً إضافياً لاحقاً.

## 6) توقيع الإصدارات
- حالياً `verifyUpdateCodeSignature` معطّل في إعدادات التحديث داخل التطبيق (لا يتم التحقق من توقيع التحديثات برمجياً).
- عند تجهيز إصدار رسمي للتوزيع، فعّل توقيع الشفرة (Code Signing) لحزم Windows (مثبّت/Portable)، ثم فعّل التحقق من توقيع التحديثات (`verifyUpdateCodeSignature`) قبل الاعتماد على التحديث التلقائي.
- احتفظ بالشهادات/المفاتيح الخاصة بشكل آمن خارج المستودع ولا ترفعها إلى GitHub.

## 7) أوامر مفيدة
```bat
git log --oneline -n 10
git remote -v
git tag v1.0.1
git push origin v1.0.1
```
