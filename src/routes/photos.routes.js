import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { uploadsPath } from '../middleware/upload.js';
import { areConnected, isBlockedBetween } from '../services/relations.js';

const router = Router();

/**
 * صورة المستخدم: يراها صاحبها فقط، أو طرف قَبِل/قُبِل معه طلب تعارف.
 * خلاف ذلك: 403 (الصورة مخفية).
 */
router.get('/:userId', authRequired, async (req, res, next) => {
  try {
    const targetId = Number(req.params.userId);
    if (!targetId) return res.status(400).json({ error: 'معرّف غير صالح' });

    const { rows } = await query(
      'SELECT photo_path FROM profiles WHERE user_id = $1',
      [targetId]
    );
    const photo = rows[0]?.photo_path;
    if (!photo) return res.status(404).json({ error: 'لا توجد صورة' });

    if (targetId !== req.userId) {
      if (await isBlockedBetween(req.userId, targetId))
        return res.status(403).json({ error: 'غير متاح' });
      if (!(await areConnected(req.userId, targetId)))
        return res
          .status(403)
          .json({ error: 'الصورة مخفية حتى قبول طلب التعارف' });
    }

    const abs = path.join(uploadsPath, photo);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'الملف مفقود' });
    res.sendFile(abs);
  } catch (err) {
    next(err);
  }
});

export default router;
