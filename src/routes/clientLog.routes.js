import { Router } from 'express';
import { verifyToken } from '../utils/jwt.js';

const router = Router();

/**
 * سجل تشخيصي من التطبيق (موبايل) لفشل عمليات لا نرى سببها الحقيقي في سجلات
 * الخادم العادية (مثل فشل رفع صورة قبل وصول الطلب للسيرفر أصلاً - الطلب نفسه
 * لا يظهر في Express/morgan لأنه لم يصل إطلاقاً). عام بلا authRequired عمداً:
 * فشل محتمل في الشبكة لا يجب أن يمنع إرسال تقرير عن هذا الفشل نفسه؛ التوكن
 * اختياري فقط لمعرفة هوية المستخدم إن كان متاحاً وصالحاً.
 */
router.post('/', (req, res) => {
  const body = req.body || {};
  let userId = null;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      userId = Number(verifyToken(header.slice(7)).sub);
    } catch {
      // توكن غير صالح/منتهٍ - نسجّل بلا هوية مستخدم بدل رفض التقرير بالكامل.
    }
  }

  const step = String(body.step || '').slice(0, 50);
  const message = String(body.message || '').slice(0, 1000);
  const uri = String(body.uri || '').slice(0, 300);
  const fileType = String(body.fileType || '').slice(0, 100);
  const fileSize = Number.isFinite(body.fileSize) ? body.fileSize : null;
  const platform = String(body.platform || '').slice(0, 20);
  const androidVersion = String(body.androidVersion || '').slice(0, 20);

  console.warn(
    `[client-log] user=${userId ?? '?'} step=${step} platform=${platform}${
      androidVersion ? '/' + androidVersion : ''
    } file=${uri} type=${fileType} size=${fileSize ?? '?'} - ${message}`
  );

  res.json({ ok: true });
});

export default router;
