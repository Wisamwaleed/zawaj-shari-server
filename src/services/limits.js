import { query } from '../db/pool.js';
import { httpError } from '../middleware/error.js';
import { isFreeMode } from './settings.js';

/**
 * حدود كل "طبقة" اشتراك (tier). -1 = بلا حدود.
 * الطبقة هي ما يُخزَّن في users.subscription_tier: free | plus | platinum.
 * المدة (أسبوع/شهر) لا تُخزَّن كطبقة، بل تُحدِّد subscription_expires_at فقط.
 * هذه هي حدود الخطة المجانية الحقيقية حين يكون FREE_MODE مُعطَّلاً؛ حين يكون
 * مفعَّلاً تتجاوز getEffectiveSubscription الطبقة المخزَّنة بالكامل إلى platinum
 * للجميع، دون تعديل أي شيء هنا (انظر getEffectiveSubscription أدناه).
 */
export const PLANS = {
  free: {
    id: 'free',
    name: 'مجاني',
    dailyRequests: 3,
    dailyMessages: 10, // إجمالي اليوم عبر كل المحادثات
    maxMessageLength: 50,
    hasVisitorsFeature: false,
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    dailyRequests: -1,
    dailyMessages: -1,
    maxMessageLength: 2000,
    hasVisitorsFeature: false,
  },
  platinum: {
    id: 'platinum',
    name: 'Platinum',
    dailyRequests: -1,
    dailyMessages: -1,
    maxMessageLength: 2000,
    hasVisitorsFeature: true,
  },
};

export const TIERS = Object.keys(PLANS);

/** ما يمنحه إعلان مكافأة واحد، حسب نوعه (انظر src/services/ads.js). */
export const AD_REWARD_AMOUNTS = { requests: 3, messages: 10 };

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

/** وصف الخطة المجانية - نفس الحدود للرجال والنساء. */
export function getFreePlanInfo() {
  return {
    id: 'free',
    name: 'مجاني',
    duration: 'دائم',
    features: [
      'تصفح الملفات المطابقة',
      `حتى ${PLANS.free.dailyRequests} طلبات تعارف يومياً`,
      `حتى ${PLANS.free.dailyMessages} رسائل يومياً (${PLANS.free.maxMessageLength} حرفاً للرسالة)`,
      `كل إعلان تشاهده = ${AD_REWARD_AMOUNTS.requests} طلبات أو ${AD_REWARD_AMOUNTS.messages} رسائل إضافية`,
    ],
  };
}

/**
 * الاشتراك الفعلي للمستخدم بعد مراعاة انتهاء الصلاحية وإعداد FREE_MODE العام.
 * إذا كانت subscription_expires_at قد مضت → يُعامَل كـ free (بدون تعديل قاعدة البيانات).
 * إذا كان FREE_MODE مفعَّلاً (إعداد عام في app_settings) → يُعامَل الجميع كـ
 * platinum بغضّ النظر عن الطبقة المخزَّنة فعلياً - دون أي تعديل لـ subscription_tier
 * في القاعدة، حتى يعود كل مستخدم لطبقته الحقيقية تلقائياً عند إيقاف FREE_MODE لاحقاً.
 * @returns {{ storedTier, effectiveTier, expiresAt: Date|null, expired: boolean, plan, freeMode: boolean }}
 */
export async function getEffectiveSubscription(userId) {
  const freeMode = await isFreeMode();
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
  let effectiveTier = storedTier === 'free' || expired ? 'free' : storedTier;
  if (freeMode) effectiveTier = 'platinum';

  return {
    storedTier,
    effectiveTier,
    expiresAt,
    expired,
    plan: PLANS[effectiveTier],
    freeMode,
  };
}

/** خطة المستخدم الفعلية (كائن من PLANS). */
export async function getPlan(userId) {
  const { plan } = await getEffectiveSubscription(userId);
  return plan;
}

/**
 * حدود الطلبات/الرسائل الفعلية للمستخدم اليوم: حد الخطة + مكافآت الإعلانات
 * التي شاهدها اليوم. نفس الحدود للجنسين. -1 = بلا حدود.
 * @returns {{ dailyRequests: number, dailyMessages: number, maxMessageLength: number,
 *   baseDailyRequests: number, baseDailyMessages: number }}
 */
export async function getEffectiveLimits(userId) {
  const plan = await getPlan(userId);
  const bonus =
    plan.dailyRequests < 0 && plan.dailyMessages < 0
      ? { requests: 0, messages: 0 }
      : await adRewardsClaimedToday(userId);
  const withBonus = (base, extra) => (base < 0 ? -1 : base + extra);
  return {
    dailyRequests: withBonus(plan.dailyRequests, bonus.requests * AD_REWARD_AMOUNTS.requests),
    dailyMessages: withBonus(plan.dailyMessages, bonus.messages * AD_REWARD_AMOUNTS.messages),
    maxMessageLength: plan.maxMessageLength,
    baseDailyRequests: plan.dailyRequests,
    baseDailyMessages: plan.dailyMessages,
  };
}

/** عدد مكافآت الإعلانات الممنوحة اليوم لكل نوع: { requests, messages }. */
export async function adRewardsClaimedToday(userId) {
  const { rows } = await query(
    `SELECT reward_type, count(*)::int AS n FROM ad_rewards
     WHERE user_id = $1 AND claimed_at >= date_trunc('day', now())
     GROUP BY reward_type`,
    [userId]
  );
  const out = { requests: 0, messages: 0 };
  for (const r of rows) if (r.reward_type in out) out[r.reward_type] = r.n;
  return out;
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

/** عدد الرسائل التي أرسلها المستخدم اليوم في كل المحادثات. */
export async function messagesSentToday(userId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM messages
     WHERE sender_id = $1 AND created_at >= date_trunc('day', now())`,
    [userId]
  );
  return rows[0].n;
}

/** يتحقق أن المستخدم لم يتجاوز حد طلبات التعارف اليومي. */
export async function assertCanSendRequest(userId) {
  const { dailyRequests } = await getEffectiveLimits(userId);
  if (dailyRequests < 0) return;
  const used = await requestsSentToday(userId);
  if (used >= dailyRequests) {
    throw httpError(
      429,
      `انتهت طلبات التعارف لليوم (${dailyRequests}). شاهد إعلاناً قصيراً لتحصل على ${AD_REWARD_AMOUNTS.requests} طلبات إضافية، أو رقِّ اشتراكك.`,
      { code: 'REQUEST_LIMIT_REACHED' }
    );
  }
}

/** يتحقق من طول الرسالة وحد الرسائل اليومي للمستخدم. */
export async function assertCanSendMessage(userId, text) {
  const { dailyMessages, maxMessageLength } = await getEffectiveLimits(userId);
  if (text.length > maxMessageLength) {
    throw httpError(
      400,
      `الحد الأقصى للرسالة في الخطة المجانية ${maxMessageLength} حرفاً.`,
      { code: 'MESSAGE_TOO_LONG' }
    );
  }
  if (dailyMessages < 0) return;
  const used = await messagesSentToday(userId);
  if (used >= dailyMessages) {
    throw httpError(
      429,
      `انتهت رسائلك لليوم (${dailyMessages}). شاهد إعلاناً قصيراً لتحصل على ${AD_REWARD_AMOUNTS.messages} رسائل إضافية، أو رقِّ اشتراكك.`,
      { code: 'MESSAGE_LIMIT_REACHED' }
    );
  }
}
