import { webColors as c } from '../constants/theme.js';

/**
 * الهيكل المشترك لكل صفحات الموقع العامة (/ و /download و /contact و /privacy
 * و /terms): وسوم Open Graph/Twitter، الأيقونات، الخط، الألوان، والتذييل.
 * أي صفحة جديدة تمرّ من هنا حتى تبقى المعاينة على فيسبوك والتذييل موحّدين.
 */

export const SITE_NAME = 'زواج شرعي';
export const SITE_TAGLINE = 'تطبيق للزواج الجاد وفق الضوابط الشرعية';
const DEFAULT_DESCRIPTION =
  'تطبيق للزواج الجاد وفق الضوابط الشرعية: تعهّد شرعي، صور محمية لا تظهر إلا بعد القبول، ومنع تبادل الأرقام. حمّله مجاناً لأندرويد.';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/** أصل الموقع كما طُلب (الدومين الحالي) - لروابط مطلقة تحتاجها معاينة فيسبوك. */
export function siteOrigin(req) {
  return `https://${escapeHtml(req.get('host'))}`;
}

const baseCss = `
  :root { color-scheme: dark; --bg: ${c.bg}; --gold: ${c.gold}; --text: ${c.text};
    --soft: ${c.textSoft}; --surface: ${c.surface}; --border: ${c.border}; --ink: ${c.inkOnGold}; }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; min-height: 100vh; display: flex; flex-direction: column;
    background: var(--bg); color: var(--text);
    font-family: 'Tajawal', -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif;
    line-height: 1.7;
  }
  a { color: var(--gold); }
  main { flex: 1; width: 100%; }
  .container { width: 100%; max-width: 960px; margin: 0 auto; padding: 0 16px; }
  .topbar { border-bottom: 1px solid rgba(212,175,55,0.15); }
  .topbar .container { display: flex; align-items: center; justify-content: space-between; height: 64px; }
  .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--text); font-weight: 800; font-size: 18px; }
  .brand img { width: 36px; height: 36px; border-radius: 10px; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    background: var(--gold); color: var(--ink); font-weight: 800; font-size: 16px;
    padding: 14px 28px; border-radius: 999px; text-decoration: none; border: none;
    cursor: pointer; font-family: inherit; transition: transform .15s, box-shadow .15s;
    box-shadow: 0 6px 24px rgba(212,175,55,0.25);
  }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(212,175,55,0.35); }
  .btn.small { padding: 9px 18px; font-size: 14px; box-shadow: none; }
  .btn[aria-disabled="true"] { opacity: .5; pointer-events: none; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 24px; }
  .muted { color: var(--soft); }
  .ios-note {
    display: none; margin: 16px auto 0; max-width: 420px; padding: 12px 16px; border-radius: 12px;
    background: rgba(212,175,55,0.1); border: 1px solid var(--border); color: var(--text); font-size: 14px; text-align: center;
  }
  .is-ios .ios-note { display: block; }
  .is-ios .android-only { display: none; }
  footer { border-top: 1px solid rgba(212,175,55,0.15); margin-top: 56px; padding: 24px 0 32px; text-align: center; font-size: 13px; color: var(--soft); }
  footer nav { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px 20px; margin-bottom: 10px; }
  footer nav a { color: var(--soft); text-decoration: none; }
  footer nav a:hover { color: var(--gold); }
`;

/**
 * @param {object} o
 * @param {import('express').Request} o.req
 * @param {string} o.title       عنوان الصفحة (يُضاف إليه اسم الموقع)
 * @param {string} o.path        مسار الصفحة لـ og:url (مثل '/download')
 * @param {string} o.body        HTML داخل <main>
 * @param {string} [o.description]
 * @param {string} [o.css]       CSS إضافي خاص بالصفحة
 * @param {boolean} [o.topbarCta] زر «تحميل التطبيق» في الشريط العلوي
 */
export function renderPage({ req, title, path, body, description = DEFAULT_DESCRIPTION, css = '', topbarCta = true }) {
  const origin = siteOrigin(req);
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} - ${SITE_TAGLINE}`;
  const desc = escapeHtml(description);
  const url = `${origin}${path}`;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${desc}" />
<meta name="theme-color" content="${c.bg}" />
<link rel="canonical" href="${url}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="ar_AR" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${escapeHtml(fullTitle)}" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${origin}/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${SITE_NAME} - ${SITE_TAGLINE}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="${origin}/og-image.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
<style>${baseCss}${css}</style>
<script>
  // زوار iPhone/iPad: التطبيق لأندرويد فقط حالياً (iPadOS يتنكّر كـ Mac مع لمس).
  (function () {
    var ua = navigator.userAgent || '';
    var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (ios) document.documentElement.classList.add('is-ios');
  })();
</script>
</head>
<body>
<header class="topbar">
  <div class="container">
    <a class="brand" href="/"><img src="/icon.png" alt="" width="36" height="36" />${SITE_NAME}</a>
    ${topbarCta ? '<a class="btn small android-only" href="/download">تحميل التطبيق</a>' : ''}
  </div>
</header>
<main>
${body}
</main>
<footer>
  <div class="container">
    <nav>
      <a href="/">الرئيسية</a>
      <a href="/download">تحميل التطبيق</a>
      <a href="/privacy">سياسة الخصوصية</a>
      <a href="/terms">الشروط والأحكام</a>
      <a href="/contact">تواصل معنا</a>
    </nav>
    <div>© ${new Date().getFullYear()} ${SITE_NAME}</div>
  </div>
</footer>
</body>
</html>`;
}

/** رسالة iPhone الموحّدة (تظهر فقط لزوار iOS عبر الصنف is-ios). */
export const IOS_NOTE = '<div class="ios-note">📱 التطبيق متوفر حالياً لأندرويد فقط. نسخة iPhone قريباً بإذن الله.</div>';
