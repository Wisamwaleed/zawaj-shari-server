import { Router } from 'express';
import { query } from '../db/pool.js';
import { getObjectBuffer, deleteObject } from '../services/storage.js';

const router = Router();
const REPORT_STATUSES = ['pending', 'resolved', 'dismissed'];

/** أرقام سريعة لأعلى لوحة الإدارة. */
router.get('/stats', async (req, res, next) => {
  try {
    const [users, pendingReports, bannedUsers, unreadMessages] = await Promise.all([
      query('SELECT count(*)::int AS n FROM users'),
      query("SELECT count(*)::int AS n FROM reports WHERE status = 'pending'"),
      query('SELECT count(*)::int AS n FROM users WHERE is_banned'),
      query('SELECT count(*)::int AS n FROM contact_messages WHERE NOT is_read'),
    ]);
    res.json({
      totalUsers: users.rows[0].n,
      pendingReports: pendingReports.rows[0].n,
      bannedUsers: bannedUsers.rows[0].n,
      unreadMessages: unreadMessages.rows[0].n,
    });
  } catch (err) {
    next(err);
  }
});

/** رسائل نموذج «تواصل معنا». ?filter=unread|all (افتراضي unread) */
router.get('/contact-messages', async (req, res, next) => {
  try {
    const unreadOnly = String(req.query.filter || 'unread') !== 'all';
    const { rows } = await query(
      `SELECT id, name, email, message, is_read, created_at FROM contact_messages
       ${unreadOnly ? 'WHERE NOT is_read' : ''}
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json({ messages: rows });
  } catch (err) {
    next(err);
  }
});

/** تعليم رسالة كمقروءة. */
router.post('/contact-messages/:id/read', async (req, res, next) => {
  try {
    await query('UPDATE contact_messages SET is_read = true WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
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
              u.is_admin, p.display_name, p.gender, p.age, p.city,
              (p.photo_path IS NOT NULL) AS has_photo
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

/**
 * أحدث الصور المرفوعة لمراجعتها (الأحدث أولاً). ?page=1
 * المشرف يرى الصورة الأصلية دون أي علاقة تعارف - هذا هو الغرض: منع المحتوى غير اللائق.
 */
router.get('/photos', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const { rows } = await query(
      `SELECT u.id, u.email, u.is_banned, p.display_name, p.gender, p.age, p.city,
              p.updated_at AS photo_updated_at
       FROM profiles p JOIN users u ON u.id = p.user_id
       WHERE p.photo_path IS NOT NULL
       ORDER BY p.updated_at DESC
       LIMIT 31 OFFSET $1`,
      [(page - 1) * 30]
    );
    res.json({ users: rows.slice(0, 30), hasMore: rows.length > 30, page });
  } catch (err) {
    next(err);
  }
});

/** الصورة الأصلية لمستخدم (للمشرف فقط - المسار كله خلف adminRequired). */
router.get('/users/:id/photo', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const buf = await getObjectBuffer(`photos/${id}/original.webp`);
    if (!buf) return res.status(404).json({ error: 'لا توجد صورة' });
    res.set('Cache-Control', 'no-store'); // صور خاصة: لا تُخزَّن في متصفح المشرف
    res.type('image/webp').send(buf);
  } catch (err) {
    next(err);
  }
});

/** حذف صورة غير لائقة دون إيقاف الحساب. */
router.delete('/users/:id/photo', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await deleteObject(`photos/${id}/original.webp`);
    await deleteObject(`photos/${id}/blurred.webp`);
    await query('UPDATE profiles SET photo_path = NULL, updated_at = now() WHERE user_id = $1', [id]);
    res.json({ ok: true });
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
