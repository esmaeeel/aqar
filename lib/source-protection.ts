export function shouldStopForSourceProtection(message: string) {
  return /429|منع موقع عقار|طلب موقع عقار تحققًا|تسجيل دخول|تعذر الاتصال مؤقتًا بمنصة عقار|تعذر اتصال (?:خادم البحث بمنصة عقار|المتصفح بخادم البحث)/.test(message);
}
