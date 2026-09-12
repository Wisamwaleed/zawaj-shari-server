import { query } from '../db/pool.js';
import { httpError } from '../middleware/error.js';
import { getAcceptedRequestForUser, isBlockedBetween } from './relations.js';
import { assertCanSendMessage } from './limits.js';
import {
  detectContactInfo,
  CONTACT_BLOCK_MESSAGE,
  CONTACT_BLOCK_CODE,
} from './contactFilter.js';

/**
 * إنشاء رسالة داخل محادثة تعارف مقبولة.
 * تُستخدم من REST ومن Socket.io معاً حتى يبقى منطق التحقق واحداً.
 * @returns {{ message: object, recipientId: number }}
 */
export async function createMessage({ requestId, senderId, body }) {
  const text = String(body || '').trim();
  if (!text) throw httpError(400, 'لا يمكن إرسال رسالة فارغة');
  if (text.length > 2000) throw httpError(400, 'الرسالة طويلة جداً');

  // فحص معلومات التواصل الخارجية (هاتف / بريد / @username) — Backend حصراً.
  if (detectContactInfo(text))
    throw httpError(422, CONTACT_BLOCK_MESSAGE, { code: CONTACT_BLOCK_CODE });

  const request = await getAcceptedRequestForUser(requestId, senderId);
  if (!request) throw httpError(403, 'لا توجد محادثة مسموح بها');

  const recipientId =
    request.sender_id === senderId ? request.receiver_id : request.sender_id;

  if (await isBlockedBetween(senderId, recipientId))
    throw httpError(403, 'المحادثة غير متاحة');

  // قيود الاشتراك (الخطة المجانية: 10 رسائل يومياً لكل محادثة).
  await assertCanSendMessage(senderId, requestId);

  const { rows } = await query(
    `INSERT INTO messages (request_id, sender_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, request_id, sender_id, body, created_at`,
    [requestId, senderId, text]
  );
  return { message: rows[0], recipientId };
}

/** جلب رسائل محادثة (بعد التحقق من مشاركة المستخدم فيها). */
export async function listMessages({ requestId, userId }) {
  const request = await getAcceptedRequestForUser(requestId, userId);
  if (!request) throw httpError(403, 'لا توجد محادثة مسموح بها');
  const { rows } = await query(
    `SELECT id, request_id, sender_id, body, created_at
     FROM messages WHERE request_id = $1 ORDER BY created_at ASC`,
    [requestId]
  );
  return rows;
}
