import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { signToken } from '../utils/jwt.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!EMAIL_RE.test(email))
      return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
    if (password.length < 8)
      return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });

    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rowCount)
      return res.status(409).json({ error: 'هذا البريد مسجّل مسبقاً' });

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    );
    const user = rows[0];
    await query('INSERT INTO profiles (user_id) VALUES ($1)', [user.id]);

    res.status(201).json({ token: signToken(user.id), user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const { rows } = await query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    res.json({ token: signToken(user.id), user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email,
              (u.pledge_accepted_at IS NOT NULL) AS pledge_accepted,
              u.pledge_accepted_at,
              u.subscription_tier,
              u.subscription_expires_at,
              (u.subscription_tier <> 'free'
                AND (u.subscription_expires_at IS NULL
                     OR u.subscription_expires_at > now())) AS subscription_active,
              CASE
                WHEN u.subscription_tier <> 'free'
                 AND (u.subscription_expires_at IS NULL
                      OR u.subscription_expires_at > now())
                THEN u.subscription_tier ELSE 'free'
              END AS effective_tier,
              p.display_name, p.gender, p.age, p.city, p.nationality,
              p.marital_status, p.education, p.bio, p.marriage_conditions,
              (p.photo_path IS NOT NULL) AS has_photo
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.userId]
    );
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

/** تسجيل الموافقة على تعهد ما بعد التسجيل (مرة واحدة، لا يمكن التراجع). */
router.post('/pledge', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE users
       SET pledge_accepted_at = COALESCE(pledge_accepted_at, now())
       WHERE id = $1
       RETURNING pledge_accepted_at`,
      [req.userId]
    );
    res.json({
      pledge_accepted: true,
      pledge_accepted_at: rows[0].pledge_accepted_at,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
