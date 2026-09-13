/**
 * تعبير SQL موحّد: هل المستخدم مشترك Platinum ساري المفعول؟
 * الفحص مزدوج: subscription_tier = 'platinum' + (لا تاريخ انتهاء أو لم يمضِ بعد).
 * @param {string} alias اسم جدول users في الاستعلام (مثل 'u').
 */
export const platinumActiveSql = (alias) =>
  `(${alias}.subscription_tier = 'platinum'
    AND (${alias}.subscription_expires_at IS NULL
         OR ${alias}.subscription_expires_at > now()))`;

/**
 * تعبير SQL موحّد: هل المستخدم مشترك (Plus أو Platinum) ساري المفعول؟
 * يُستخدم في تبويب "الترشيحات" لعرض المشتركين فقط.
 * @param {string} alias اسم جدول users في الاستعلام (مثل 'u').
 */
export const subscriberActiveSql = (alias) =>
  `(${alias}.subscription_tier IN ('plus', 'platinum')
    AND (${alias}.subscription_expires_at IS NULL
         OR ${alias}.subscription_expires_at > now()))`;
