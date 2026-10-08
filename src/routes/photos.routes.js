import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { getObjectBuffer } from '../services/storage.js';
import { areConnected, isBlockedBetween } from '../services/relations.js';
import { signPhotoToken, verifyPhotoToken } from '../services/photoAccess.js';

const router = Router();

/**
 * يُصدر توكناً قصير العمر (10 دقائق) لعرض صورة مستخدم واحد مرة واحدة.
 * يُحدَّد وضع العرض الآن (لحظة الإصدار) حسب العلاقة الفعلية:
 * - صاحب الصورة نفسه، أو طرف مقبول معه طلب تعارف → full (الصورة الأصلية).
 * - غير ذلك (لا علاقة بعد) → blurred (نسخة ضبابية صُنعت في السيرفر عند الرفع، لا تُرسل الأصل أبداً).
 * - محظور بين الطرفين → 403 (لا يُصدَر توكن إطلاقاً).
 */
router.get('/:userId/token', authRequired, async (req, res, next) => {
  try {
    const targetId = Number(req.params.userId);
    if (!targetId) return res.status(400).json({ error: 'معرّف غير صالح' });

    const { rows } = await query(
      'SELECT photo_path FROM profiles WHERE user_id = $1',
      [targetId]
    );
    if (!rows[0]?.photo_path) return res.status(404).json({ error: 'لا توجد صورة' });

    let mode;
    if (targetId === req.userId) {
      mode = 'full';
    } else {
      if (await isBlockedBetween(req.userId, targetId))
        return res.status(403).json({ error: 'غير متاح' });
      mode = (await areConnected(req.userId, targetId)) ? 'full' : 'blurred';
    }

    const token = signPhotoToken({ viewerId: req.userId, targetId, mode });
    res.json({ token, mode, expiresInSeconds: 600 });
  } catch (err) {
    next(err);
  }
});

/**
 * يقدّم بايتات الصورة نفسها بالاعتماد فقط على توكن قصير العمر (pt) وليس
 * جلسة المستخدم - حتى لا يبقى رابط <Image> صالحاً لمدة الجلسة كاملة (7 أيام)
 * لو نُسخ. يُعاد فحص الحظر لحظة التسليم أيضاً (دفاع إضافي).
 * النسختان (original/blurred) جاهزتان مسبقاً منذ الرفع (R2 أو القرص محلياً) -
 * لا معالجة صور هنا إطلاقاً، فقط جلب وإرسال. لا تُخزَّن هذه الاستجابة أبداً.
 */
router.get('/image', async (req, res, next) => {
  try {
    let access;
    try {
      access = verifyPhotoToken(String(req.query.pt || ''));
    } catch {
      return res.status(401).json({ error: 'رابط الصورة منتهي أو غير صالح' });
    }
    const { viewerId, targetId, mode } = access;

    if (viewerId !== targetId && (await isBlockedBetween(viewerId, targetId))) {
      return res.status(403).json({ error: 'غير متاح' });
    }

    const { rows } = await query(
      'SELECT photo_path FROM profiles WHERE user_id = $1',
      [targetId]
    );
    if (!rows[0]?.photo_path) return res.status(404).json({ error: 'لا توجد صورة' });

    const key = `photos/${targetId}/${mode === 'full' ? 'original' : 'blurred'}.webp`;
    const buf = await getObjectBuffer(key);
    if (!buf) return res.status(404).json({ error: 'الملف مفقود' });

    res.set('Cache-Control', 'no-store, private');
    res.type('image/webp').send(buf);
  } catch (err) {
    next(err);
  }
});

export default router;
