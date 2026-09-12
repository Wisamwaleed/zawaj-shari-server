/**
 * تعبير SQL موحّد: هل المستخدم مشترك Platinum ساري المفعول؟
 * الفحص مزدوج: subscription_tier = 'platinum' + (لا تاريخ انتهاء أو لم يمضِ بعد).
 * @param {string} alias اسم جدول users في الاستعلام (مثل 'u').
 */
export const platinumActiveSql = (alias) =>
  `(${alias}.subscription_tier = 'platinum'
    AND (${alias}.subscription_expires_at IS NULL
         OR ${alias}.subscription_expires_at > now()))`;
