export function notFound(req, res) {
  res.status(404).json({ error: 'المسار غير موجود' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const body = { error: err.message || 'حدث خطأ في الخادم' };
  if (status < 500 && err.code) body.code = err.code;
  res.status(status).json(body);
}

/**
 * اختصار لإنشاء خطأ برسالة عربية ورمز حالة.
 * extra: حقول إضافية تُدمج في الخطأ (مثل { code: 'X' }).
 */
export const httpError = (status, message, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });
