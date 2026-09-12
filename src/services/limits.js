import { query } from '../db/pool.js';
import { httpError } from '../middleware/error.js';

/**
 * حدود كل "طبقة" اشتراك (tier). -1 = بلا حدود.
 * الطبقة هي ما يُخزَّن في users.subscription_tier: free | plus | platinum.
 * المدة (أسبوع/شهر) لا تُخزَّن كطبقة، بل تُحدِّد subscription_expires_at فقط.
 */
export const PLANS = {
  free: {
    id: 'free',
    name: 'مجاني',
    dailyRequests: 3,
    dailyMessagesPerConversation: 10,
    hasVisitorsFeature: false,
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    dailyRequests: -1,
    dailyMessagesPerConversation: -1,
    hasVisitorsFeature: false,
  },
  platinum: {
    id: 'platinum',
    name: 'Platinum',
    dailyRequests: -1,
    dailyMessagesPerConversation: -1,
    hasVisitorsFeature: true,
  },
};

export const TIERS = Object.keys(PLANS);

/**
 * العروض المدفوعة المعروضة في صفحة الاشتراكات.
 * كل عرض = طبقة (tier) + مدة بالأيام.
 */
const PLUS_FEATURES = ['طلبات تعارف غير محدودة', 'رسائل غير محدودة'];

const PLATINUM_FEATURES = [
  'طلبات تعارف غير محدودة',
  'رسائل غير محدودة',
  'رؤية «من زار ملفك الشخصي»',
  'أولوية الظهور في التصفح والبحث',
  'شارة «Platinum» مميزة بجانب اسمك',
];

export const PAID_OFFERS = [
  {
    id: 'plus_weekly',
    tier: 'plus',
    durationDays: 7,
    name: 'Plus أسبوعي',
    duration: '7 أيام',
    price: '2$',
    priceValue: 2,
    features: [...PLUS_FEATURES, 'تجديد كل 7 أيام'],
  },
  {
    id: 'plus_monthly',
    tier: 'plus',
    durationDays: 30,
    name: 'Plus شهري',
    duration: '30 يوماً',
    price: '6.5$',
    priceValue: 6.5,
    features: [...PLUS_FEATURES, 'تجديد كل 30 يوماً'],
  },
  {
    id: 'platinum_weekly',
    tier: 'platinum',
    durationDays: 7,
    name: 'Platinum أسبوعي',
    duration: '7 أيام',
    price: '3.5$',
    priceValue: 3.5,
    features: [...PLATINUM_FEATURES, 'تجديد كل 7 أيام'],
  },
  {
    id: 'platinum_monthly',
    tier: 'platinum',
    durationDays: 30,
    name: 'Platinum شهري',
    duration: '30 يوماً',
    price: '12$',
    priceValue: 12,
    features: [...PLATINUM_FEATURES, 'تجديد كل 30 يوماً'],
  },
];

export const PAID_OFFERS_BY_ID = Object.fromEntries(
  PAID_OFFERS.map((o) => [o.id, o])
);

export const FREE_PLAN_INFO = {
  id: 'free',
  name: 'مجاني',
  duration: 'دائم',
  features: [
    'تصفح الملفات المطابقة',
    'حتى 3 طلبات تعارف يومياً',
    'حتى 10 رسائل يومياً في كل محادثة',
  ],
};

/**
 * الاشتراك الفعلي للمستخدم بعد مراعاة انتهاء الصلاحية.
 * إذا كانت subscription_expires_at قد مضت → يُعامَل كـ free (بدون تعديل قاعدة البيانات).
 * @returns {{ storedTier, effectiveTier, expiresAt: Date|null, expired: boolean, plan }}
 */
export async function getEffectiveSubscription(userId) {
  const { rows } = await query(
    'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
    [userId]
  );
  const storedTier = TIERS.includes(rows[0]?.subscription_tier)
    ? rows[0].subscription_tier
    : 'free';
  const expiresAt = rows[0]?.subscription_expires_at
    ? new Date(rows[0].subscription_expires_at)
    : null;

  const expired =
    storedTier !== 'free' && expiresAt !== null && expiresAt.getTime() <= Date.now();
  const effectiveTier = storedTier === 'free' || expired ? 'free' : storedTier;

  return {
    storedTier,
    effectiveTier,
    expiresAt,
    expired,
    plan: PLANS[effectiveTier],
  };
}

/** خطة المستخدم الفعلية (كائن من PLANS). */
export async function getPlan(userId) {
  const { plan } = await getEffectiveSubscription(userId);
  return plan;
}

/** هل لدى المستخدم اشتراك Platinum ساري المفعول؟ */
export async function hasActivePlatinum(userId) {
  const { effectiveTier } = await getEffectiveSubscription(userId);
  return effectiveTier === 'platinum';
}

/** عدد طلبات التعارف التي أرسلها المستخدم اليوم. */
export async function requestsSentToday(userId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM interest_requests
     WHERE sender_id = $1 AND created_at >= date_trunc('day', now())`,
    [userId]
  );
  return rows[0].n;
}

/** عدد الرسائل التي أرسلها المستخدم اليوم داخل محادثة معيّنة. */
export async function messagesSentTodayInConversation(userId, requestId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM messages
     WHERE sender_id = $1 AND request_id = $2
       AND created_at >= date_trunc('day', now())`,
    [userId, requestId]
  );
  return rows[0].n;
}

/** يتحقق أن المستخدم لم يتجاوز حد طلبات التعارف اليومي (وفق الاشتراك الفعلي). */
export async function assertCanSendRequest(userId) {
  const plan = await getPlan(userId);
  if (plan.dailyRequests < 0) return;
  const used = await requestsSentToday(userId);
  if (used >= plan.dailyRequests) {
    throw httpError(
      429,
      `بلغت الحد اليومي (${plan.dailyRequests} طلبات) في الخطة المجانية. رقِّ اشتراكك لطلبات غير محدودة.`,
      { code: 'LIMIT_REACHED' }
    );
  }
}

/** يتحقق أن المستخدم لم يتجاوز حد الرسائل اليومي في هذه المحادثة (وفق الاشتراك الفعلي). */
export async function assertCanSendMessage(userId, requestId) {
  const plan = await getPlan(userId);
  if (plan.dailyMessagesPerConversation < 0) return;
  const used = await messagesSentTodayInConversation(userId, requestId);
  if (used >= plan.dailyMessagesPerConversation) {
    throw httpError(
      429,
      `بلغت الحد اليومي (${plan.dailyMessagesPerConversation} رسائل في المحادثة) في الخطة المجانية. رقِّ اشتراكك لرسائل غير محدودة.`,
      { code: 'LIMIT_REACHED' }
    );
  }
}
