import { Router } from 'express';
import { query } from '../db/pool.js';
import { getSetting } from '../services/settings.js';
import { authRequired } from '../middleware/auth.js';
import {
  PAID_OFFERS,
  PAID_OFFERS_BY_ID,
  getFreePlanInfo,
  getEffectiveSubscription,
  getEffectiveLimits,
  requestsSentToday,
  messagesSentToday,
} from '../services/limits.js';

const router = Router();

/** حالة اشتراك المستخدم + العروض المتاحة + استهلاك اليوم. */
router.get('/', authRequired, async (req, res, next) => {
  try {
    const sub = await getEffectiveSubscription(req.userId);
    const limits = await getEffectiveLimits(req.userId);
    const [usedRequests, usedMessages] = await Promise.all([
      requestsSentToday(req.userId),
      messagesSentToday(req.userId),
    ]);

    res.json({
      freeMode: sub.freeMode,
      freePlan: getFreePlanInfo(sub.effectiveTier === 'free' && sub.plan.dailyRequests < 0),
      paidOffers: PAID_OFFERS,
      // الطبقة المخزّنة والفعلية (قد تختلفان إذا انتهت الصلاحية أو كان FREE_MODE مفعَّلاً)
      storedTier: sub.storedTier,
      currentTier: sub.effectiveTier,
      expiresAt: sub.expiresAt,
      expired: sub.expired,
      hasVisitorsFeature: sub.plan.hasVisitorsFeature,
      usage: {
        requestsToday: usedRequests,
        dailyRequestLimit: limits.dailyRequests, // -1 = بلا حدود (يشمل مكافآت الإعلانات)
        messagesToday: usedMessages,
        dailyMessageLimit: limits.dailyMessages,
        maxMessageLength: limits.maxMessageLength,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * تفعيل خطة (تجريبي - بدون دفع فعلي). تفعيل الخطط المدفوعة مغلق افتراضياً
 * (ALLOW_DEMO_SUBSCRIPTIONS=false) - وإلا يحصل أي مستخدم على Platinum مجاناً
 * بمجرد ضغطة، ما يُبطل حدود الخطة المجانية بالكامل. يُفتح فقط للتجربة.
 * body: { plan: 'free' | 'plus_weekly' | 'plus_monthly' | 'platinum_weekly' | 'platinum_monthly' }
 */
router.post('/', authRequired, async (req, res, next) => {
  try {
    const plan = String(req.body?.plan || '');

    if (plan === 'free') {
      await query(
        `UPDATE users SET subscription_tier = 'free', subscription_expires_at = NULL
         WHERE id = $1`,
        [req.userId]
      );
      return res.json(await getEffectiveSubscription(req.userId));
    }

    const offer = PAID_OFFERS_BY_ID[plan];
    if (!offer) return res.status(400).json({ error: 'خطة غير معروفة' });
    if ((await getSetting('ALLOW_DEMO_SUBSCRIPTIONS')) !== 'true') {
      return res.status(403).json({
        error: 'الدفع الإلكتروني غير متاح بعد. سيتم تفعيل الاشتراكات المدفوعة قريباً.',
        code: 'PAYMENTS_UNAVAILABLE',
      });
    }

    const expiresAt = new Date(
      Date.now() + offer.durationDays * 24 * 60 * 60 * 1000
    );
    await query(
      `UPDATE users SET subscription_tier = $1, subscription_expires_at = $2
       WHERE id = $3`,
      [offer.tier, expiresAt, req.userId]
    );
    res.json(await getEffectiveSubscription(req.userId));
  } catch (err) {
    next(err);
  }
});

export default router;
