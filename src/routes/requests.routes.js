import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import {
  isBlockedBetween,
  getUserGender,
  OPPOSITE_GENDER,
} from '../services/relations.js';
import { assertCanSendRequest } from '../services/limits.js';
import { platinumActiveSql } from '../services/subscriptionSql.js';

const router = Router();

/** إرسال طلب تعارف. body: { receiverId } */
router.post('/', authRequired, async (req, res, next) => {
  try {
    const receiverId = Number(req.body?.receiverId);
    if (!receiverId || receiverId === req.userId)
      return res.status(400).json({ error: 'طلب غير صالح' });

    const target = await query('SELECT 1 FROM users WHERE id = $1', [receiverId]);
    if (!target.rowCount)
      return res.status(404).json({ error: 'المستخدم غير موجود' });

    // قيد إجباري: طلب التعارف بين الجنسين المختلفين فقط.
    const [myGender, theirGender] = await Promise.all([
      getUserGender(req.userId),
      getUserGender(receiverId),
    ]);
    if (!myGender)
      return res.status(403).json({ error: 'حدّد جنسك في ملفك الشخصي أولاً' });
    if (theirGender !== OPPOSITE_GENDER[myGender])
      return res.status(403).json({ error: 'لا يمكن إرسال الطلب لهذا الملف' });

    if (await isBlockedBetween(req.userId, receiverId))
      return res.status(403).json({ error: 'لا يمكن إرسال الطلب' });

    // قيود الاشتراك (الخطة المجانية: 3 طلبات يومياً).
    await assertCanSendRequest(req.userId);

    const { rows } = await query(
      `INSERT INTO interest_requests (sender_id, receiver_id)
       VALUES ($1, $2)
       ON CONFLICT (sender_id, receiver_id) DO NOTHING
       RETURNING id, sender_id, receiver_id, status, created_at`,
      [req.userId, receiverId]
    );
    if (!rows.length)
      return res.status(409).json({ error: 'سبق أن أرسلت طلباً لهذا الملف' });

    res.status(201).json({ request: rows[0] });
  } catch (err) {
    next(err);
  }
});

/** قوائم الطلبات: الواردة والصادرة. */
router.get('/', authRequired, async (req, res, next) => {
  try {
    const incoming = await query(
      `SELECT r.id, r.status, r.created_at,
              p.user_id, p.display_name, p.age, p.city, p.nationality,
              ${platinumActiveSql('u')} AS is_platinum
       FROM interest_requests r
       JOIN profiles p ON p.user_id = r.sender_id
       JOIN users u ON u.id = r.sender_id
       WHERE r.receiver_id = $1
       ORDER BY r.created_at DESC`,
      [req.userId]
    );
    const outgoing = await query(
      `SELECT r.id, r.status, r.created_at,
              p.user_id, p.display_name, p.age, p.city, p.nationality,
              ${platinumActiveSql('u')} AS is_platinum
       FROM interest_requests r
       JOIN profiles p ON p.user_id = r.receiver_id
       JOIN users u ON u.id = r.receiver_id
       WHERE r.sender_id = $1
       ORDER BY r.created_at DESC`,
      [req.userId]
    );
    res.json({ incoming: incoming.rows, outgoing: outgoing.rows });
  } catch (err) {
    next(err);
  }
});

/** رد على طلب وارد. body: { action: 'accept' | 'reject' } */
router.post('/:id/respond', authRequired, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const action = req.body?.action;
    if (!['accept', 'reject'].includes(action))
      return res.status(400).json({ error: 'إجراء غير معروف' });

    const status = action === 'accept' ? 'accepted' : 'rejected';
    const { rows } = await query(
      `UPDATE interest_requests
       SET status = $1, updated_at = now()
       WHERE id = $2 AND receiver_id = $3 AND status = 'pending'
       RETURNING id, sender_id, receiver_id, status`,
      [status, id, req.userId]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'الطلب غير موجود أو تم الرد عليه' });

    res.json({ request: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
