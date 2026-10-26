import { Router } from 'express';
import { getSettings } from '../services/settings.js';
import { getObjectStream } from '../services/storage.js';
import { renderPage, escapeHtml, IOS_NOTE } from '../web/layout.js';

const router = Router();

const downloadCss = `
  .narrow { max-width: 520px; margin: 0 auto; padding: 40px 16px 0; text-align: center; }
  .icon { width: 96px; height: 96px; border-radius: 24px; }
  h1 { color: var(--gold); font-size: 28px; margin: 14px 0 4px; }
  .version { display: inline-block; font-size: 13px; padding: 3px 12px; border-radius: 999px;
    background: rgba(212,175,55,0.15); color: var(--gold); margin-bottom: 22px; }
  .dl .btn { width: 100%; font-size: 18px; padding: 16px; }
  .note { font-size: 13px; margin: 10px 0 0; }
  .card { text-align: right; margin-top: 22px; }
  .card h2 { color: var(--gold); font-size: 18px; margin: 0 0 10px; }
  ol { margin: 0; padding-inline-start: 22px; }
  ol li { margin-bottom: 8px; font-size: 14.5px; }
  .safe { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; }
  .changelog { white-space: pre-wrap; font-size: 14px; margin: 0; }
`;

/** صفحة التنزيل - الرابط المنشور للناس (لا متجر). */
router.get('/', async (req, res, next) => {
  try {
    const s = await getSettings();
    const apkUrl = s.APK_URL || '';
    const version = s.LATEST_VERSION_NAME || '';
    const changelog = escapeHtml(s.CHANGELOG || '');

    const body = `
<div class="narrow">
  <img class="icon" src="/icon.png" alt="أيقونة تطبيق زواج شرعي" width="96" height="96" />
  <h1>تحميل تطبيق زواج شرعي</h1>
  ${version ? `<div class="version">الإصدار ${escapeHtml(version)} · أندرويد</div>` : '<div class="version">أندرويد</div>'}

  <div class="dl android-only">
    ${apkUrl
      ? `<a class="btn" href="${escapeHtml(apkUrl)}">تحميل التطبيق</a>`
      : '<span class="btn" aria-disabled="true">التحميل غير متاح حالياً</span>'}
    <p class="note muted">ملف APK لأجهزة أندرويد - لا حاجة لمتجر Google Play</p>
  </div>
  ${IOS_NOTE}

  <div class="card">
    <h2>خطوات التثبيت</h2>
    <ol>
      <li>اضغط «تحميل التطبيق» وانتظر اكتمال التنزيل.</li>
      <li>افتح الملف من شريط الإشعارات أو من مجلد التنزيلات.</li>
      <li>إذا ظهرت رسالة تمنع التثبيت، اذهب إلى: الإعدادات ← الأمان (أو التطبيقات) ← السماح بالتثبيت من هذا المصدر.</li>
      <li>ارجع وافتح الملف مجدداً واضغط «تثبيت».</li>
    </ol>
  </div>

  <div class="card">
    <div class="safe"><span aria-hidden="true">🛡️</span>
      <div>قد يظهر لك تحذير عند التنزيل أو التثبيت. <b>التحذير طبيعي لأن التطبيق خارج المتجر، والتطبيق آمن.</b></div>
    </div>
  </div>

  ${changelog ? `<div class="card"><h2>ما الجديد${version ? ` في ${escapeHtml(version)}` : ''}</h2><p class="changelog">${changelog}</p></div>` : ''}
</div>`;

    res.type('html').send(
      renderPage({
        req,
        title: 'تحميل التطبيق',
        path: '/download',
        description: `حمّل تطبيق زواج شرعي لأندرويد مجاناً${version ? ` - الإصدار ${version}` : ''}. تطبيق للزواج الجاد وفق الضوابط الشرعية.`,
        body,
        css: downloadCss,
        topbarCta: false,
      })
    );
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
