import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import {
  areConnected,
  getUserGender,
  OPPOSITE_GENDER,
  RELIGIOUS_LEVELS,
} from '../services/relations.js';
import { platinumActiveSql, subscriberActiveSql } from '../services/subscriptionSql.js';

const router = Router();

/**
 * تصفح الملفات.
 * قيد إجباري (Backend): يُعرض فقط الجنس المقابل لجنس المستخدم الحالي.
 * - إن لم يحدّد المستخدم جنسه بعد → تُعاد قائمة فارغة مع needsGender: true.
 * - فلتر الجنس القادم من العميل يُتجاهل تماماً.
 * فلاتر اختيارية مسموح بها: minAge, maxAge, city.
 * لا تُرجع الصور - فقط has_photo وحالة طلب التعارف الحالية.
 */
router.get('/', authRequired, async (req, res, next) => {
  try {
    const myGender = await getUserGender(req.userId);
    if (!myGender) {
      return res.json({ profiles: [], needsGender: true });
    }
    const targetGender = OPPOSITE_GENDER[myGender];

    const { minAge, maxAge, city, religiousCommitment } = req.query;
    const where = [
      'p.user_id <> $1',
      'p.gender = $2', // ← القيد الإجباري: الجنس المقابل فقط
      `p.user_id NOT IN (
         SELECT blocked_id FROM blocks WHERE blocker_id = $1
         UNION
         SELECT blocker_id FROM blocks WHERE blocked_id = $1
       )`,
    ];
    const values = [req.userId, targetGender];
    let i = 3;

    if (minAge) {
      where.push(`p.age >= $${i++}`);
      values.push(parseInt(minAge, 10));
    }
    if (maxAge) {
      where.push(`p.age <= $${i++}`);
      values.push(parseInt(maxAge, 10));
    }
    if (city) {
      where.push(`p.city ILIKE $${i++}`);
      values.push(`%${String(city).trim()}%`);
    }
    if (religiousCommitment && RELIGIOUS_LEVELS.includes(String(religiousCommitment))) {
      where.push(`p.religious_commitment = $${i++}`);
      values.push(String(religiousCommitment));
    }

    const { rows } = await query(
      `SELECT p.user_id, p.display_name, p.gender, p.age, p.city, p.nationality,
              p.marital_status, p.education, p.bio, p.marriage_conditions,
              p.religious_commitment,
              (p.photo_path IS NOT NULL) AS has_photo,
              ${platinumActiveSql('u')} AS is_platinum,
              r.id     AS request_id,
              r.status AS request_status,
              r.sender_id AS request_sender_id
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN interest_requests r
         ON (r.sender_id = $1 AND r.receiver_id = p.user_id)
         OR (r.receiver_id = $1 AND r.sender_id = p.user_id)
       WHERE ${where.join(' AND ')}
       ORDER BY ${platinumActiveSql('u')} DESC,   -- أولوية ظهور مشتركي Platinum
                p.updated_at DESC NULLS LAST
       LIMIT 60`,
      values
    );
    res.json({ profiles: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * تبويب "الترشيحات": يعرض فقط المشتركين (Plus أو Platinum) من الجنس المقابل.
 * نفس قيود /browse (الجنس المقابل، استبعاد المحظورين) لكن بدون فلاتر اختيارية،
 * وبأولوية ظهور Platinum قبل Plus.
 */
router.get('/recommended', authRequired, async (req, res, next) => {
  try {
    const myGender = await getUserGender(req.userId);
    if (!myGender) {
      return res.json({ profiles: [], needsGender: true });
    }
    const targetGender = OPPOSITE_GENDER[myGender];

    const { rows } = await query(
      `SELECT p.user_id, p.display_name, p.gender, p.age, p.city, p.nationality,
              p.marital_status, p.education, p.bio, p.marriage_conditions,
              p.religious_commitment,
              (p.photo_path IS NOT NULL) AS has_photo,
              ${platinumActiveSql('u')} AS is_platinum,
              r.id     AS request_id,
              r.status AS request_status,
              r.sender_id AS request_sender_id
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN interest_requests r
         ON (r.sender_id = $1 AND r.receiver_id = p.user_id)
         OR (r.receiver_id = $1 AND r.sender_id = p.user_id)
       WHERE p.user_id <> $1
         AND p.gender = $2
         AND ${subscriberActiveSql('u')}
         AND p.user_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id = $1
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_id = $1
         )
       ORDER BY ${platinumActiveSql('u')} DESC,
                p.updated_at DESC NULLS LAST
       LIMIT 60`,
      [req.userId, targetGender]
    );
    res.json({ profiles: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * ملف شخصي واحد بالتفصيل.
 * يُطبَّق نفس القيد: لا يمكن عرض ملف من نفس الجنس (يُعامَل كأنه غير موجود).
 */
router.get('/:userId', authRequired, async (req, res, next) => {
  try {
    const targetId = Number(req.params.userId);
    if (!targetId) return res.status(400).json({ error: 'معرّف غير صالح' });

    const myGender = await getUserGender(req.userId);
    if (!myGender)
      return res
        .status(403)
        .json({ error: 'حدّد جنسك في ملفك الشخصي أولاً', needsGender: true });

    const { rows } = await query(
      `SELECT p.user_id, p.display_name, p.gender, p.age, p.city, p.nationality,
              p.marital_status, p.education, p.bio, p.marriage_conditions,
              p.religious_commitment,
              (p.photo_path IS NOT NULL) AS has_photo,
              ${platinumActiveSql('u')} AS is_platinum,
              r.id AS request_id, r.status AS request_status,
              r.sender_id AS request_sender_id
       FROM profiles p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN interest_requests r
         ON (r.sender_id = $1 AND r.receiver_id = p.user_id)
         OR (r.receiver_id = $1 AND r.sender_id = p.user_id)
       WHERE p.user_id = $2`,
      [req.userId, targetId]
    );

    const profile = rows[0];
    // نفس الجنس أو جنس غير محدّد → لا نكشف البيانات إطلاقاً.
    if (!profile || profile.gender !== OPPOSITE_GENDER[myGender]) {
      return res.status(404).json({ error: 'الملف غير موجود' });
    }

    // تسجيل الزيارة (لميزة "من زار ملفك" لمشتركي Platinum).
    // صف واحد لكل زوج (زائر، مُزار)، يُحدَّث تاريخه عند كل زيارة.
    if (targetId !== req.userId) {
      query(
        `INSERT INTO profile_visits (visitor_id, visited_id)
         VALUES ($1, $2)
         ON CONFLICT (visitor_id, visited_id)
         DO UPDATE SET created_at = now()`,
        [req.userId, targetId]
      ).catch((e) => console.error('تعذّر تسجيل زيارة الملف:', e.message));
    }

    profile.can_view_photo =
      profile.has_photo && (await areConnected(req.userId, targetId));
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

export default router;
