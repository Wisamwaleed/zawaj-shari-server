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

const MESSAGES_DEFAULT_LIMIT = 50;
const MESSAGES_MAX_LIMIT = 100;

/**
 * جلب رسائل محادثة (بعد التحقق من مشاركة المستخدم فيها)، من الأحدث فالأقدم
 * داخلياً ثم مُعادة بترتيب زمني تصاعدي للعرض المباشر في الشاشة.
 * beforeId (اختياري): لجلب رسائل أقدم من رسالة معيّنة ("تحميل المزيد" للأعلى).
 * @returns {{ messages: object[], hasMore: boolean }}
 */
export async function listMessages({ requestId, userId, beforeId, limit }) {
  const request = await getAcceptedRequestForUser(requestId, userId);
  if (!request) throw httpError(403, 'لا توجد محادثة مسموح بها');

  const take = Math.min(MESSAGES_MAX_LIMIT, Math.max(1, parseInt(limit, 10) || MESSAGES_DEFAULT_LIMIT));
  const params = [requestId];
  let cursorClause = '';
  if (beforeId) {
    params.push(Number(beforeId));
    cursorClause = `AND id < $${params.length}`;
  }
  params.push(take + 1);

  const { rows } = await query(
    `SELECT id, request_id, sender_id, body, created_at
     FROM messages
     WHERE request_id = $1 ${cursorClause}
     ORDER BY id DESC
     LIMIT $${params.length}`,
    params
  );
  const hasMore = rows.length > take;
  const page = rows.slice(0, take).reverse(); // تصاعدي للعرض
  return { messages: page, hasMore };
}
