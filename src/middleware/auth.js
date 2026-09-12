import { verifyToken } from '../utils/jwt.js';
import { query } from '../db/pool.js';

/** استخراج التوكن من رأس Authorization أو من ?t= (لوسم <img>). */
function extractToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : req.query.t || null;
}

/** يتطلب رأس Authorization: Bearer <token> ويضع req.userId. */
export function authRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  try {
    const payload = verifyToken(token);
    req.userId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: 'الجلسة غير صالحة أو منتهية' });
  }
}

/**
 * دفاع خلفي: يمنع أي طلب من مستخدم لم يوافق على التعهّد بعد.
 * يُركَّب على مستوى مجموعات المسارات (قبل مسارات البيانات).
 * لا يتعامل مع طلبات بلا توكن أو بتوكن غير صالح — يتركها لـ authRequired داخل المسار.
 */
export async function pledgeRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) return next(); // authRequired سيُرجع 401
  let userId;
  try {
    userId = Number(verifyToken(token).sub);
  } catch {
    return next(); // authRequired سيُرجع 401
  }
  try {
    const { rows } = await query(
      'SELECT pledge_accepted_at FROM users WHERE id = $1',
      [userId]
    );
    if (rows.length && rows[0].pledge_accepted_at == null) {
      return res.status(403).json({
        error: 'يجب الموافقة على التعهّد أولاً',
        code: 'PLEDGE_REQUIRED',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
