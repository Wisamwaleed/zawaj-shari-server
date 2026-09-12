import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

// تصنيفات البلاغ المسموح بها ونصوصها العربية.
const REPORT_CATEGORIES = {
  inappropriate: 'محتوى غير لائق',
  fake: 'حساب مزيف',
  harassment: 'إساءة وتحرش',
  other: 'سبب آخر',
};

/**
 * إبلاغ عن مستخدم.
 * body: { reportedId, category: 'inappropriate'|'fake'|'harassment'|'other', details?: string }
 * يُحفظ البلاغ فقط للمراجعة اليدوية - لا إجراء تلقائي على الحساب.
 */
router.post('/report', authRequired, async (req, res, next) => {
  try {
    const reportedId = Number(req.body?.reportedId);
    const category = String(req.body?.category || '');
    const details = String(req.body?.details || '').trim().slice(0, 1000);

    if (!reportedId || reportedId === req.userId)
      return res.status(400).json({ error: 'بلاغ غير صالح' });
    if (!REPORT_CATEGORIES[category])
      return res.status(400).json({ error: 'يرجى اختيار سبب الإبلاغ' });
    if (category === 'other' && !details)
      return res.status(400).json({ error: 'يرجى كتابة سبب الإبلاغ' });

    const target = await query('SELECT 1 FROM users WHERE id = $1', [reportedId]);
    if (!target.rowCount)
      return res.status(404).json({ error: 'المستخدم غير موجود' });

    const reason = details
      ? `${REPORT_CATEGORIES[category]} - ${details}`
      : REPORT_CATEGORIES[category];

    await query(
      'INSERT INTO reports (reporter_id, reported_id, category, reason) VALUES ($1, $2, $3, $4)',
      [req.userId, reportedId, category, reason]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** حظر مستخدم. body: { blockedId }  (يُلغي أي طلبات تعارف معلّقة/مقبولة بينهما) */
router.post('/block', authRequired, async (req, res, next) => {
  try {
    const blockedId = Number(req.body?.blockedId);
    if (!blockedId || blockedId === req.userId)
      return res.status(400).json({ error: 'طلب غير صالح' });

    await query(
      `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [req.userId, blockedId]
    );
    await query(
      `UPDATE interest_requests SET status = 'rejected', updated_at = now()
       WHERE status IN ('pending', 'accepted')
         AND ((sender_id = $1 AND receiver_id = $2)
           OR (sender_id = $2 AND receiver_id = $1))`,
      [req.userId, blockedId]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** رفع الحظر. body: { blockedId } */
router.post('/unblock', authRequired, async (req, res, next) => {
  try {
    const blockedId = Number(req.body?.blockedId);
    await query(
      'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
      [req.userId, blockedId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** قائمة من حظرتهم. */
router.get('/blocks', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.blocked_id AS user_id, p.display_name
       FROM blocks b
       LEFT JOIN profiles p ON p.user_id = b.blocked_id
       WHERE b.blocker_id = $1
       ORDER BY b.created_at DESC`,
      [req.userId]
    );
    res.json({ blocks: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
