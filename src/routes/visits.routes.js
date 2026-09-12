import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { hasActivePlatinum } from '../services/limits.js';
import { platinumActiveSql } from '../services/subscriptionSql.js';

const router = Router();

/**
 * "من زار ملفي" — حصري لمشتركي Platinum ساري المفعول.
 * الفحص مزدوج: subscription_tier = 'platinum' وأيضاً subscription_expires_at لم تنتهِ.
 */
router.get('/', authRequired, async (req, res, next) => {
  try {
    if (!(await hasActivePlatinum(req.userId))) {
      return res.status(403).json({
        error: 'هذه الميزة حصرية لمشتركي Platinum',
        code: 'PLATINUM_ONLY',
      });
    }

    const { rows } = await query(
      `SELECT v.visitor_id AS user_id,
              v.created_at  AS visited_at,
              p.display_name, p.age, p.city, p.nationality,
              p.gender,
              ${platinumActiveSql('u')} AS is_platinum
       FROM profile_visits v
       JOIN profiles p ON p.user_id = v.visitor_id
       JOIN users u ON u.id = v.visitor_id
       WHERE v.visited_id = $1
         AND v.visitor_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id = $1
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_id = $1
         )
       ORDER BY v.created_at DESC
       LIMIT 100`,
      [req.userId]
    );
    res.json({ visitors: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
