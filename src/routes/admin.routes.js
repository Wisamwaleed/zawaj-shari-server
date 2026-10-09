import { Router } from 'express';
import { query } from '../db/pool.js';

const router = Router();
const REPORT_STATUSES = ['pending', 'resolved', 'dismissed'];

/** أرقام سريعة لأعلى لوحة الإدارة. */
router.get('/stats', async (req, res, next) => {
  try {
    const [users, pendingReports, bannedUsers] = await Promise.all([
      query('SELECT count(*)::int AS n FROM users'),
      query("SELECT count(*)::int AS n FROM reports WHERE status = 'pending'"),
      query('SELECT count(*)::int AS n FROM users WHERE is_banned'),
    ]);
    res.json({
      totalUsers: users.rows[0].n,
      pendingReports: pendingReports.rows[0].n,
      bannedUsers: bannedUsers.rows[0].n,
    });
  } catch (err) {
    next(err);
  }
});

/** قائمة البلاغات. ?status=pending|resolved|dismissed|all (افتراضي pending) */
router.get('/reports', async (req, res, next) => {
  try {
    const status = String(req.query.status || 'pending');
    const where = status === 'all' ? '' : 'WHERE r.status = $1';
    const params = status === 'all' ? [] : [status];
    if (status !== 'all' && !REPORT_STATUSES.includes(status))
      return res.status(400).json({ error: 'حالة بلاغ غير صالحة' });

    const { rows } = await query(
      `SELECT r.id, r.category, r.reason, r.status, r.created_at, r.resolved_at,
              r.reporter_id, ru.email AS reporter_email, rp.display_name AS reporter_name,
              r.reported_id, tu.email AS reported_email, tp.display_name AS reported_name,
              tu.is_banned AS reported_is_banned
       FROM reports r
       JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN profiles rp ON rp.user_id = r.reporter_id
       JOIN users tu ON tu.id = r.reported_id
       LEFT JOIN profiles tp ON tp.user_id = r.reported_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT 200`,
      params
    );
    res.json({ reports: rows });
  } catch (err) {
    next(err);
  }
});

/** تحديد حالة بلاغ بعد المراجعة. body: { action: 'resolved' | 'dismissed' } */
router.post('/reports/:id/resolve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const action = String(req.body?.action || '');
    if (!['resolved', 'dismissed'].includes(action))
      return res.status(400).json({ error: 'إجراء غير صالح' });

    const { rows } = await query(
      `UPDATE reports SET status = $1, resolved_at = now(), resolved_by = $2
       WHERE id = $3 RETURNING id`,
      [action, req.userId, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'البلاغ غير موجود' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** بحث مستخدمين بالبريد أو الاسم المعروض (لمعاينة سريعة/إيقاف حساب). */
router.get('/users', async (req, res, next) => {
  try {
    const q = `%${String(req.query.q || '').trim()}%`;
    const { rows } = await query(
      `SELECT u.id, u.email, u.created_at, u.is_banned, u.banned_at, u.ban_reason,
              u.is_admin, p.display_name, p.gender, p.age
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.email ILIKE $1 OR p.display_name ILIKE $1
       ORDER BY u.created_at DESC
       LIMIT 50`,
      [q]
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

/** إيقاف حساب. body: { reason? } */
router.post('/users/:id/ban', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.userId)
      return res.status(400).json({ error: 'لا يمكنك إيقاف حسابك الخاص' });
    const reason = String(req.body?.reason || '').trim().slice(0, 500) || null;
    const { rows } = await query(
      `UPDATE users SET is_banned = true, banned_at = now(), ban_reason = $1
       WHERE id = $2 RETURNING id`,
      [reason, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** رفع الإيقاف عن حساب. */
router.post('/users/:id/unban', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await query(
      `UPDATE users SET is_banned = false, banned_at = NULL, ban_reason = NULL
       WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
