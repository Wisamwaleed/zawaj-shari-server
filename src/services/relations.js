import { query } from '../db/pool.js';

/** القيم المسموح بها لحقل الجنس. */
export const GENDERS = ['male', 'female'];

/** الجنس المقابل. */
export const OPPOSITE_GENDER = { male: 'female', female: 'male' };

/** القيم المسموح بها لحقل مستوى الالتزام الديني (اختياري). */
export const RELIGIOUS_LEVELS = ['ملتزم جداً', 'ملتزم', 'متوسط الالتزام'];

/** جلب جنس مستخدم ('male' | 'female' | null إذا لم يُحدَّد). */
export async function getUserGender(userId) {
  const { rows } = await query(
    'SELECT gender FROM profiles WHERE user_id = $1',
    [userId]
  );
  const g = rows[0]?.gender;
  return GENDERS.includes(g) ? g : null;
}

/** هل يوجد حظر بين المستخدمَين في أي اتجاه؟ */
export async function isBlockedBetween(a, b) {
  const { rowCount } = await query(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)`,
    [a, b]
  );
  return rowCount > 0;
}

/** هل بين المستخدمَين طلب تعارف مقبول؟ (يعني: تُكشف الصورة وتُفتح المحادثة) */
export async function areConnected(a, b) {
  const { rowCount } = await query(
    `SELECT 1 FROM interest_requests
     WHERE status = 'accepted'
       AND ((sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1))`,
    [a, b]
  );
  return rowCount > 0;
}

/** جلب طلب تعارف مقبول يشارك فيه المستخدم، أو null. */
export async function getAcceptedRequestForUser(requestId, userId) {
  const { rows } = await query(
    `SELECT * FROM interest_requests
     WHERE id = $1 AND status = 'accepted'
       AND (sender_id = $2 OR receiver_id = $2)`,
    [requestId, userId]
  );
  return rows[0] || null;
}
