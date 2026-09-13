export function shouldStopForSourceProtection(message: string) {
  return /429|منع موقع عقار|طلب موقع عقار تحققًا|تسجيل دخول/.test(message);
}
