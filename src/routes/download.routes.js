import { Router } from 'express';
import { getSettings } from '../services/settings.js';

const router = Router();

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/** صفحة تنزيل عامة بألوان التطبيق - الرابط الوحيد الذي يُنشَر للناس (لا متجر). */
router.get('/', async (req, res, next) => {
  try {
    const s = await getSettings();
    const apkUrl = s.APK_URL || '';
    const changelog = escapeHtml(s.CHANGELOG || '');

    res.type('html').send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>زواج شرعي - تحميل التطبيق</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    background: #0B3D26;
    color: #f2e9d0;
    font-family: -apple-system, Segoe UI, Tahoma, Arial, sans-serif;
    display: flex; align-items: center; justify-content: center;
    padding: 32px 16px;
  }
  .card {
    width: 100%; max-width: 440px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(212,175,55,0.35);
    border-radius: 24px;
    padding: 32px 24px;
    text-align: center;
  }
  .icon {
    width: 96px; height: 96px; border-radius: 24px;
    margin-bottom: 16px;
  }
  h1 { font-size: 22px; margin: 0 0 8px; color: #D4AF37; }
  p.desc { font-size: 14px; color: #cfd8d2; line-height: 1.7; margin: 0 0 24px; }
  .btn {
    display: inline-block; width: 100%;
    background: #D4AF37; color: #0B3D26;
    font-weight: 800; font-size: 16px;
    padding: 16px; border-radius: 999px;
    text-decoration: none;
    margin-bottom: 8px;
  }
  .btn[aria-disabled="true"] { opacity: 0.5; pointer-events: none; }
  .note { font-size: 12px; color: #93a69c; margin-bottom: 24px; }
  .changelog {
    text-align: right; background: rgba(0,0,0,0.2);
    border-radius: 12px; padding: 14px 16px; margin-bottom: 24px;
    font-size: 13px; line-height: 1.8; white-space: pre-wrap;
  }
  .steps { text-align: right; font-size: 13px; line-height: 2; color: #e6dcc0; }
  .steps b { color: #D4AF37; }
</style>
</head>
<body>
  <div class="card">
    <img class="icon" src="/icon.png" alt="زواج شرعي" />
    <h1>زواج شرعي</h1>
    <p class="desc">منصة تعارف زواج جدية ومحافظة. نزّل أحدث نسخة من التطبيق مباشرة من هنا.</p>

    ${apkUrl
      ? `<a class="btn" href="${escapeHtml(apkUrl)}">تحميل التطبيق</a>`
      : `<span class="btn" aria-disabled="true">التحميل غير متاح حالياً</span>`}
    <div class="note">ملف APK لأجهزة أندرويد - لا حاجة لمتجر Google Play</div>

    ${changelog ? `<div class="changelog">${changelog}</div>` : ''}

    <div class="steps">
      <div><b>1.</b> اضغط «تحميل التطبيق» وانتظر اكتمال التنزيل.</div>
      <div><b>2.</b> افتح الملف من شريط الإشعارات أو من مجلد التنزيلات.</div>
      <div><b>3.</b> إذا ظهرت رسالة تمنع التثبيت، اذهب إلى: الإعدادات ← الأمان (أو التطبيقات) ← السماح بالتثبيت من هذا المصدر.</div>
      <div><b>4.</b> ارجع وافتح الملف مجدداً واضغط «تثبيت».</div>
    </div>
  </div>
</body>
</html>`);
  } catch (err) {
    next(err);
  }
});

export default router;
