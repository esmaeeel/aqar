# باحث عقار

تطبيق عربي للبحث في إعلانات عقار، يعمل كخدمة واحدة على Cloudflare Workers:
واجهة Vinext/React، وواجهات API، وملفات ثابتة، وقاعدة Cloudflare D1.

- رابط الإنتاج: `https://aqar-investment-search.esmaeeel.workers.dev/`
- Worker: `aqar-investment-search`
- مستودع المصدر: `https://github.com/esmaeeel/aqar`، الفرع `main`
- لا تنفذ بحثًا حيًا في عقار أثناء الاختبارات؛ فهو يستهلك حصة التجربة.

## التطوير والتحقق

يتطلب المشروع Node.js 22.13 أو أحدث وpnpm.

```bash
pnpm install --frozen-lockfile
pnpm run build
node --test tests/rendered-html.test.mjs
```

## قاعدة البيانات والنشر

- يربط `wrangler.jsonc` المتغير `DB` بقاعدة D1 المعتمدة.
- تبقى ترحيلات Drizzle في `drizzle/`. ويحتوي `migrations/` النسخة المتسلسلة
  التي ينفذها Wrangler؛ أضف أي ترحيل جديد إلى المسارين بالاسم والترتيب نفسيهما.
- النشر اليدوي: `pnpm run deploy:cloudflare`؛ يطبق ترحيلات D1 البعيدة أولًا
  ثم ينشر Worker.
- النشر التلقائي: Cloudflare Workers Builds متصل بـ`esmaeeel/aqar`، ويبني كل
  دفع إلى `main` بالأمر `pnpm run build` ثم ينشره بالأمر
  `pnpm run deploy:cloudflare`.
- لا تحفظ الأسرار في Git. أضفها فقط من Cloudflare Workers > Settings >
  Variables and Secrets. لا يحتاج التطبيق الحالي إلى سر تشغيل.

يبقى مشروع Sites السابق وبياناته احتياطًا ولا يُعدلان ضمن مسار Cloudflare.
