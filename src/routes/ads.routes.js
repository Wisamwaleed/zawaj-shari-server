import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import {
  getRewardedStatus,
  createRewardedSession,
  claimRewardedSession,
  verifySsvCallback,
} from '../services/ads.js';

const router = Router();

/** حالة إعلان المكافأة للمستخدم (متاح؟ كم شاهد اليوم؟ كم بقي على الانتظار؟). */
router.get('/rewarded', authRequired, async (req, res, next) => {
  try {
    res.json(await getRewardedStatus(req.userId));
  } catch (err) {
    next(err);
  }
});

/** يبدأ جلسة إعلان ويعيد nonce يُمرَّر لـ AdMob كـ customData. body: { type: 'requests' | 'messages' } */
router.post('/rewarded/session', authRequired, async (req, res, next) => {
  try {
    res.json(await createRewardedSession(req.userId, String(req.body?.type || '')));
  } catch (err) {
    next(err);
  }
});

/** يمنح المكافأة بعد EARNED_REWARD. body: { nonce } */
router.post('/rewarded/claim', authRequired, async (req, res, next) => {
  try {
    res.json(await claimRewardedSession(req.userId, req.body?.nonce));
  } catch (err) {
    next(err);
  }
});

/**
 * استدعاء Server-Side Verification من خوادم Google - عام بلا مصادقة عمداً،
 * والحماية هي توقيع ECDSA نفسه. يُضبط هذا الرابط في لوحة AdMob لوحدة الإعلان.
 */
router.get('/ssv', async (req, res) => {
  try {
    const raw = req.originalUrl.split('?')[1] || '';
    const ok = await verifySsvCallback(raw, req.query);
    res.status(ok ? 200 : 400).end();
  } catch (err) {
    // تكرار transaction_id (إعادة إرسال من Google) ليس خطأً - التأكيد مسجّل أصلاً.
    if (err.code === '23505') return res.status(200).end();
    console.error('AdMob SSV:', err.message);
    res.status(500).end();
  }
});

export default router;
