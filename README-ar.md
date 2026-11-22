# نشر «ورق» على مشروع Workers المرتبط بـ GitHub

1. افتحي قاعدة waraq-db في Cloudflare. إذا لم يظهر جدولَا projects وnotes، نفّذي محتوى waraq-worker/schema.sql في Console.
2. انسخي Database ID لقاعدة waraq-db من صفحة القاعدة. افتحي waraq-worker/wrangler.jsonc واستبدلي REPLACE_WITH_D1_DATABASE_ID بالمعرّف بين علامتي الاقتباس. معرّف القاعدة مختلف عن رمز الوصول API Token.
3. في مشروع Worker باسم waraq، افتحي Settings ثم Variables and Secrets وأضيفي WARAQ_PASSWORD من نوع Secret. استخدمي كلمة مرور عشوائية قوية بأحرف وأرقام ورموز إنجليزية. ضعيها في إعدادات تشغيل Worker وأبقيها خارج GitHub.
4. في إعدادات البناء في Cloudflare اضبطي Root directory على waraq-worker واتركي Build command فارغًا واضبطي Deploy command على npx wrangler deploy. راجعي اسم فرع الإنتاج في إعدادات البناء.
5. ارفعي مجلد waraq-worker بعد فك الضغط إلى جذر المستودع anaaba00001-pixel/waraq في فرع الإنتاج. يمكن سحب المجلد إلى GitHub من Add file ثم Upload files، والتحقق من مسارات الملفات قبل Commit changes. ملف README هذا للشرح ويمكن الاحتفاظ به على جهازك.
6. تابعي العملية من Deployments. عند نجاح النشر افتحي رابط workers.dev من Domains. إذا طلب Cloudflare إنشاء workers.dev subdomain للحساب، أكملي تفعيله من Domains ثم افتحي الرابط.
7. عند تسجيل الدخول اكتبي waraq اسمًا للمستخدم، واستخدمي كلمة المرور التي أنشأتِها. جرّبي حفظ ملاحظة ثم أعيدي تحميل الصفحة. لنقل بيانات قديمة، صدّري JSON من النسخة السابقة ثم اختاري «استيراد نسخة» في الموقع الجديد.

إعداد run_worker_first يمرر طلبات الواجهة عبر فحص كلمة المرور. ينتظر الموقع قيمة WARAQ_PASSWORD وربط DB قبل إتاحة البيانات. إعداد workers_dev يطلب تفعيل عنوان المشروع عند النشر.
