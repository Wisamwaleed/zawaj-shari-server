import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { createMessage, listMessages } from '../services/messages.js';
import { platinumActiveSql } from '../services/subscriptionSql.js';

const router = Router();

/** قائمة المحادثات المتاحة (طلبات تعارف مقبولة) مع آخر رسالة. */
router.get('/conversations', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id AS request_id,
              other.user_id AS other_user_id,
              other.display_name, other.age, other.city,
              ${platinumActiveSql('ou')} AS is_platinum,
              last.body AS last_message,
              last.created_at AS last_message_at
       FROM interest_requests r
       JOIN profiles other
         ON other.user_id = CASE WHEN r.sender_id = $1 THEN r.receiver_id ELSE r.sender_id END
       JOIN users ou ON ou.id = other.user_id
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM messages m
         WHERE m.request_id = r.id
         ORDER BY m.created_at DESC LIMIT 1
       ) last ON true
       WHERE r.status = 'accepted' AND (r.sender_id = $1 OR r.receiver_id = $1)
       ORDER BY COALESCE(last.created_at, r.updated_at) DESC`,
      [req.userId]
    );
    res.json({ conversations: rows });
  } catch (err) {
    next(err);
  }
});

/** رسائل محادثة معيّنة. */
router.get('/:requestId', authRequired, async (req, res, next) => {
  try {
    const messages = await listMessages({
      requestId: Number(req.params.requestId),
      userId: req.userId,
    });
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

/** إرسال رسالة عبر REST (بديل عن Socket.io عند الحاجة). */
router.post('/:requestId', authRequired, async (req, res, next) => {
  try {
    const { message } = await createMessage({
      requestId: Number(req.params.requestId),
      senderId: req.userId,
      body: req.body?.body,
    });
    req.app.get('io')?.to(`req:${message.request_id}`).emit('chat:message', message);
    res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
});

export default router;
