import { verifyToken } from '../utils/jwt.js';
import { query } from '../db/pool.js';

/** استخراج التوكن من رأس Authorization أو من ?t= (لوسم <img>). */
function extractToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : req.query.t || null;
}

/**
 * يتطلب رأس Authorization: Bearer <token> ويضع req.userId.
 * يفحص أيضاً is_banned في كل طلب (لا فقط عند تسجيل الدخول) حتى يُطبَّق أي
 * إيقاف حساب من لوحة الإدارة فوراً، حتى لو كان المستخدم يحمل توكن جلسة سابق
 * صالحاً لمدة أيام (JWT_EXPIRES_IN).
 */
export async function authRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  let userId;
  try {
    userId = Number(verifyToken(token).sub);
  } catch {
    return res.status(401).json({ error: 'الجلسة غير صالحة أو منتهية' });
  }
  try {
    const { rows } = await query('SELECT is_banned FROM users WHERE id = $1', [userId]);
    if (!rows.length) return res.status(401).json({ error: 'الجلسة غير صالحة أو منتهية' });
    if (rows[0].is_banned)
      return res.status(403).json({ error: 'تم إيقاف هذا الحساب', code: 'BANNED' });
    req.userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}

/** يتطلب is_admin = true (يُركَّب دائماً بعد authRequired). */
export async function adminRequired(req, res, next) {
  try {
    const { rows } = await query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!rows.length || !rows[0].is_admin)
      return res.status(403).json({ error: 'صلاحيات غير كافية' });
    next();
  } catch (err) {
    next(err);
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
