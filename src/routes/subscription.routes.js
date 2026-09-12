import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import {
  PAID_OFFERS,
  PAID_OFFERS_BY_ID,
  FREE_PLAN_INFO,
  getEffectiveSubscription,
  requestsSentToday,
} from '../services/limits.js';

const router = Router();

/** حالة اشتراك المستخدم + العروض المتاحة + استهلاك اليوم. */
router.get('/', authRequired, async (req, res, next) => {
  try {
    const sub = await getEffectiveSubscription(req.userId);
    const usedRequests = await requestsSentToday(req.userId);

    res.json({
      freePlan: FREE_PLAN_INFO,
      paidOffers: PAID_OFFERS,
      // الطبقة المخزّنة والفعلية (قد تختلفان إذا انتهت الصلاحية)
      storedTier: sub.storedTier,
      currentTier: sub.effectiveTier,
      expiresAt: sub.expiresAt,
      expired: sub.expired,
      hasVisitorsFeature: sub.plan.hasVisitorsFeature,
      usage: {
        requestsToday: usedRequests,
        dailyRequestLimit: sub.plan.dailyRequests, // -1 = بلا حدود
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * تفعيل خطة (تجريبي - بدون دفع فعلي).
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
