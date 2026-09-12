/**
 * فلتر معلومات التواصل الخارجية داخل رسائل المحادثة.
 * يُطبَّق في الـ Backend حصراً قبل حفظ أي رسالة، فلا يمكن التحايل عليه من الواجهة.
 */

export const CONTACT_BLOCK_MESSAGE =
  'لأسباب أمنية، لا يمكن مشاركة أرقام الهواتف أو البريد الإلكتروني أو أسماء الحسابات على مواقع التواصل داخل المحادثة.';

export const CONTACT_BLOCK_CODE = 'CONTACT_INFO_BLOCKED';

// تطبيع الأرقام العربية (٠-٩) والفارسية (۰-۹) إلى لاتينية قبل الفحص.
function normalizeDigits(s) {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// 2) بريد إلكتروني: نص@نص.امتداد
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;

// 3) اسم مستخدم على منصات التواصل: @ غير مسبوق بحرف/رقم، يليه حرفان+ (لاتيني/رقم/_/.)
const HANDLE_RE = /(?:^|[^\w@])@[A-Za-z0-9_][A-Za-z0-9_.]{1,}/;

/** 1) هاتف: 7 أرقام متتالية أو أكثر، مع أو بدون مسافات/شرطات/أقواس/نقاط/+ بينها. */
function hasPhoneNumber(text) {
  const candidates = normalizeDigits(text).match(/\d[\d\s().+-]{5,}\d/g);
  if (!candidates) return false;
  return candidates.some((c) => c.replace(/\D/g, '').length >= 7);
}

/**
 * يفحص نص الرسالة.
 * @returns {'email'|'handle'|'phone'|null} نوع المعلومة المكتشفة أو null إن كان النص نظيفاً.
 */
export function detectContactInfo(rawText) {
  const text = String(rawText || '');
  if (EMAIL_RE.test(text)) return 'email';
  if (HANDLE_RE.test(text)) return 'handle';
  if (hasPhoneNumber(text)) return 'phone';
  return null;
}
