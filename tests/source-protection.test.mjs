import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/source-protection.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { shouldStopForSourceProtection } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("لا يوقف البحث بسبب اختلاف هوية إعلان واحد", () => {
  assert.equal(shouldStopForSourceProtection("6675345: تعذر التحقق من هوية الإعلان: الرابط 6675345 والصفحة 7200953584"), false);
});

test("يبقي التوقف عند حماية منصة عقار", () => {
  assert.equal(shouldStopForSourceProtection("أوقف موقع عقار القراءة مؤقتًا بسبب كثرة الطلبات (429)."), true);
  assert.equal(shouldStopForSourceProtection("منع موقع عقار القراءة الآلية مؤقتًا (403)."), true);
  assert.equal(shouldStopForSourceProtection("طلب موقع عقار تحققًا أو تسجيل دخول؛ توقف الجمع دون تجاوز الحماية."), true);
  assert.equal(shouldStopForSourceProtection("تعذر الاتصال مؤقتًا بمنصة عقار بعد إعادة المحاولة."), true);
});
