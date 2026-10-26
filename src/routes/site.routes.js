import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { query } from '../db/pool.js';
import { renderPage, escapeHtml, IOS_NOTE, SITE_TAGLINE } from '../web/layout.js';

const router = Router();

const FEATURES = [
  ['🤝', 'تعهّد شرعي', 'كل مستخدم يوقّع تعهّداً بالجدية والالتزام بالضوابط الشرعية قبل أن يبدأ.'],
  ['🔒', 'صور محمية', 'الصور مخفية ولا تظهر إلا بعد قبول طلب التعارف، ويُمنع تصويرها من الشاشة.'],
  ['📵', 'منع تبادل الأرقام', 'لا يمكن تبادل أرقام الهواتف أو الحسابات داخل المحادثة، حمايةً للجميع.'],
  ['🎯', 'فلترة دقيقة', 'ابحث حسب البلد ومستوى التدين والمواصفات التي تهمّك.'],
  ['🔞', '18+ فقط', 'التطبيق مخصّص للبالغين فقط، مع تأكيد العمر عند التسجيل.'],
  ['🎁', 'مجاني حالياً', 'حمّل التطبيق واستخدمه مجاناً.'],
];

const STEPS = [
  ['أنشئ حسابك', 'سجّل بالبريد الإلكتروني، ووقّع التعهّد الشرعي، وأكمل ملفك الشخصي.'],
  ['تصفّح وأرسل طلب تعارف', 'استخدم الفلاتر لتجد الأنسب لك، ثم أرسل طلب تعارف باحترام.'],
  ['تواصل بعد القبول', 'عند قبول الطلب تظهر الصورة وتُفتح المحادثة بين الطرفين.'],
];

const homeCss = `
  .hero { text-align: center; padding: 56px 0 40px; }
  .hero .icon { width: 112px; height: 112px; border-radius: 28px; box-shadow: 0 10px 40px rgba(212,175,55,0.2); }
  .hero h1 { font-size: clamp(32px, 7vw, 48px); color: var(--gold); margin: 20px 0 6px; font-weight: 800; }
  .hero .tagline { font-size: clamp(17px, 3.6vw, 21px); margin: 0 0 28px; }
  .hero .sub { margin-top: 12px; font-size: 13px; }
  section { padding: 32px 0; }
  h2.section-title { text-align: center; color: var(--gold); font-size: 26px; margin: 0 0 24px; }
  .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
  .feature { padding: 20px; }
  .feature .emoji { font-size: 28px; line-height: 1; }
  .feature h3 { margin: 12px 0 6px; font-size: 18px; color: var(--text); }
  .feature p { margin: 0; font-size: 14.5px; }
  .steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; counter-reset: step; }
  .step { position: relative; padding-top: 28px; }
  .step .num {
    width: 40px; height: 40px; border-radius: 50%; background: var(--gold); color: var(--ink);
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; margin-bottom: 12px;
  }
  .step h3 { margin: 0 0 6px; font-size: 18px; }
  .step p { margin: 0; font-size: 14.5px; }
  .cta { text-align: center; }
  .cta .card { padding: 36px 20px; }
  .cta h2 { color: var(--gold); margin: 0 0 8px; font-size: 24px; }
  .cta p { margin: 0 0 22px; }
`;

router.get('/', (req, res) => {
  const body = `
<div class="container">
  <section class="hero">
    <img class="icon" src="/icon.png" alt="أيقونة تطبيق زواج شرعي" width="112" height="112" />
    <h1>زواج شرعي</h1>
    <p class="tagline">${SITE_TAGLINE}</p>
    <a class="btn android-only" href="/download">تحميل التطبيق</a>
    <div class="sub muted android-only">لأجهزة أندرويد · مجاني</div>
    ${IOS_NOTE}
  </section>

  <section>
    <h2 class="section-title">لماذا زواج شرعي؟</h2>
    <div class="features">
      ${FEATURES.map(([e, t, d]) => `
      <div class="card feature">
        <div class="emoji" aria-hidden="true">${e}</div>
        <h3>${t}</h3>
        <p class="muted">${d}</p>
      </div>`).join('')}
    </div>
  </section>

  <section>
    <h2 class="section-title">كيف يعمل؟</h2>
    <div class="steps">
      ${STEPS.map(([t, d], i) => `
      <div class="card step">
        <div class="num">${i + 1}</div>
        <h3>${t}</h3>
        <p class="muted">${d}</p>
      </div>`).join('')}
    </div>
  </section>

  <section class="cta">
    <div class="card">
      <h2>ابدأ رحلتك نحو الزواج الحلال</h2>
      <p class="muted">بخصوصية واحترام، ووفق الضوابط الشرعية.</p>
      <a class="btn android-only" href="/download">تحميل التطبيق</a>
      ${IOS_NOTE}
    </div>
  </section>
</div>`;
  res.type('html').send(renderPage({ req, title: '', path: '/', body, css: homeCss, topbarCta: true }));
});

const formCss = `
  .narrow { max-width: 560px; margin: 0 auto; padding: 40px 16px 0; }
  h1 { color: var(--gold); text-align: center; font-size: 28px; margin: 0 0 6px; }
  .lead { text-align: center; margin: 0 0 24px; }
  label { display: block; font-size: 14px; margin: 14px 0 6px; font-weight: 700; }
  input, textarea {
    width: 100%; background: rgba(0,0,0,0.4); border: 1px solid var(--border); color: var(--text);
    border-radius: 12px; padding: 12px 14px; font-size: 16px; font-family: inherit;
  }
  input:focus, textarea:focus { outline: 2px solid var(--gold); outline-offset: 1px; }
  textarea { min-height: 150px; resize: vertical; }
  .hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
  .actions { margin-top: 20px; }
  .actions .btn { width: 100%; }
  .alert { border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; font-size: 14px; }
  .alert.ok { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.4); }
  .alert.err { background: rgba(225,29,72,0.12); border: 1px solid rgba(225,29,72,0.4); }
`;

function contactPage(req, { alert = '', values = {} } = {}) {
  const v = (k) => escapeHtml(values[k] || '');
  const body = `
<div class="narrow">
  <h1>تواصل معنا</h1>
  <p class="lead muted">لأي سؤال أو اقتراح أو مشكلة، اكتب لنا وسنرد عليك على بريدك الإلكتروني.</p>
  <div class="card">
    ${alert}
    <form method="post" action="/contact">
      <label for="name">الاسم</label>
      <input id="name" name="name" maxlength="100" required value="${v('name')}" autocomplete="name" />
      <label for="email">البريد الإلكتروني</label>
      <input id="email" name="email" type="email" maxlength="200" required value="${v('email')}" autocomplete="email" dir="ltr" />
      <label for="message">رسالتك</label>
      <textarea id="message" name="message" maxlength="3000" required>${v('message')}</textarea>
      <div class="hp" aria-hidden="true"><label>اترك هذا الحقل فارغاً<input name="website" tabindex="-1" autocomplete="off" /></label></div>
      <div class="actions"><button class="btn" type="submit">إرسال</button></div>
    </form>
  </div>
</div>`;
  return renderPage({
    req,
    title: 'تواصل معنا',
    path: '/contact',
    description: 'تواصل مع فريق تطبيق زواج شرعي لأي سؤال أو اقتراح أو مشكلة.',
    body,
    css: formCss,
  });
}

router.get('/contact', (req, res) => {
  res.type('html').send(contactPage(req));
});

// يمنع إغراق صندوق الرسائل: 5 رسائل في الساعة لكل IP.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).type('html').send(
      contactPage(req, {
        alert: '<div class="alert err">أرسلت رسائل كثيرة. حاول مرة أخرى بعد ساعة.</div>',
        values: req.body,
      })
    ),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post(
  '/contact',
  express.urlencoded({ extended: false, limit: '20kb' }),
  contactLimiter,
  async (req, res, next) => {
    try {
      const name = String(req.body?.name || '').trim().slice(0, 100);
      const email = String(req.body?.email || '').trim().slice(0, 200);
      const message = String(req.body?.message || '').trim().slice(0, 3000);

      // حقل فخ مخفي: البوتات تملؤه، البشر لا يرونه. نتظاهر بالنجاح دون حفظ.
      if (req.body?.website) {
        return res.type('html').send(
          contactPage(req, { alert: '<div class="alert ok">تم إرسال رسالتك، شكراً لك.</div>' })
        );
      }
      if (!name || !message || !EMAIL_RE.test(email)) {
        return res.status(400).type('html').send(
          contactPage(req, {
            alert: '<div class="alert err">يرجى تعبئة الاسم وبريد إلكتروني صحيح والرسالة.</div>',
            values: { name, email, message },
          })
        );
      }

      await query(
        'INSERT INTO contact_messages (name, email, message, ip) VALUES ($1, $2, $3, $4)',
        [name, email, message, req.ip]
      );
      res.type('html').send(
        contactPage(req, {
          alert: '<div class="alert ok">تم إرسال رسالتك بنجاح، وسنرد عليك على بريدك الإلكتروني قريباً بإذن الله.</div>',
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

export default router;
