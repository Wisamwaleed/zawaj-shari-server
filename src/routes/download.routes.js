import { Router } from 'express';
import { getSettings } from '../services/settings.js';
import { webColors as c } from '../constants/theme.js';
import { getObjectStream } from '../services/storage.js';

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
    // فيسبوك يحتاج روابط مطلقة لصورة المعاينة؛ نبنيها من الدومين الذي طُلبت منه الصفحة.
    const origin = `https://${escapeHtml(req.get('host'))}`;
    const ogTitle = 'زواج شرعي - تطبيق تعارف للزواج الجاد';
    const ogDesc = 'منصة تعارف زواج جدية ومحافظة. الصور مخفية حتى القبول، والمحادثة بعد الموافقة فقط. حمّل التطبيق مجاناً لأندرويد.';

    res.type('html').send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>زواج شرعي - تحميل التطبيق</title>
<meta name="description" content="${ogDesc}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="ar_AR" />
<meta property="og:site_name" content="زواج شرعي" />
<meta property="og:title" content="${ogTitle}" />
<meta property="og:description" content="${ogDesc}" />
<meta property="og:url" content="${origin}/download" />
<meta property="og:image" content="${origin}/icon.png" />
<meta name="twitter:card" content="summary" />
<link rel="icon" href="/icon.png" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh;
    background: ${c.bg};
    color: ${c.text};
    font-family: -apple-system, Segoe UI, Tahoma, Arial, sans-serif;
    display: flex; align-items: center; justify-content: center;
    padding: 32px 16px;
  }
  .card {
    width: 100%; max-width: 440px;
    background: ${c.surface};
    border: 1px solid ${c.border};
    border-radius: 24px;
    padding: 32px 24px;
    text-align: center;
  }
  .icon {
    width: 96px; height: 96px; border-radius: 24px;
    margin-bottom: 16px;
  }
  h1 { font-size: 22px; margin: 0 0 8px; color: ${c.gold}; }
  p.desc { font-size: 14px; color: ${c.textSoft}; line-height: 1.7; margin: 0 0 24px; }
  .btn {
    display: inline-block; width: 100%;
    background: ${c.gold}; color: ${c.inkOnGold};
    font-weight: 800; font-size: 16px;
    padding: 16px; border-radius: 999px;
    text-decoration: none;
    margin-bottom: 8px;
  }
  .btn[aria-disabled="true"] { opacity: 0.5; pointer-events: none; }
  .note { font-size: 12px; color: ${c.textSoft}; margin-bottom: 24px; }
  .changelog {
    text-align: right; background: rgba(0,0,0,0.3);
    border-radius: 12px; padding: 14px 16px; margin-bottom: 24px;
    font-size: 13px; line-height: 1.8; white-space: pre-wrap;
  }
  .steps { text-align: right; font-size: 13px; line-height: 2; color: ${c.text}; }
  .steps b { color: ${c.gold}; }
  .legal { margin-top: 20px; font-size: 12px; color: ${c.textSoft}; }
  .legal a { color: ${c.textSoft}; text-decoration: underline; }
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

    <div class="legal"><a href="/privacy">سياسة الخصوصية</a> &nbsp;·&nbsp; <a href="/terms">الشروط والأحكام</a></div>
  </div>
</body>
</html>`);
  } catch (err) {
    next(err);
  }
});

/**
 * ملف APK نفسه، يُبث من R2 (الحاوية خاصة - لا رابط عام مباشر). رابط ثابت لا
 * ينتهي، بعكس روابط Expo المؤقتة. المفتاح في الإعداد APK_R2_KEY.
 */
router.get('/zawaj-shari.apk', async (req, res, next) => {
  try {
    const key = (await getSettings()).APK_R2_KEY;
    const obj = key ? await getObjectStream(key, req.headers.range) : null;
    if (!obj) return res.status(404).type('text').send('الملف غير متاح حالياً');

    res.status(obj.contentRange ? 206 : 200);
    res.set({
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': 'attachment; filename="zawaj-shari.apk"',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    if (obj.contentLength != null) res.set('Content-Length', String(obj.contentLength));
    if (obj.contentRange) res.set('Content-Range', obj.contentRange);
    obj.body.on('error', (err) => res.destroy(err));
    req.on('close', () => obj.body.destroy?.());
    obj.body.pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
