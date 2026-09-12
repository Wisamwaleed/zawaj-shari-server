import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { uploadPhoto, uploadsPath } from '../middleware/upload.js';
import { GENDERS, RELIGIOUS_LEVELS } from '../services/relations.js';

const router = Router();

// الحقول النصية/الاختيارية القابلة للتعديل من العميل.
const EDITABLE = [
  'display_name',
  'gender',
  'age',
  'city',
  'nationality',
  'marital_status',
  'education',
  'bio',
  'marriage_conditions',
  'religious_commitment',
];

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT user_id, display_name, gender, age, city, nationality,
              marital_status, education, bio, marriage_conditions,
              religious_commitment,
              (photo_path IS NOT NULL) AS has_photo, updated_at
       FROM profiles WHERE user_id = $1`,
      [req.userId]
    );
    res.json({ profile: rows[0] || null });
  } catch (err) {
    next(err);
  }
});

router.put('/me', authRequired, async (req, res, next) => {
  try {
    const body = req.body || {};
    const sets = [];
    const values = [];
    let i = 1;

    for (const field of EDITABLE) {
      if (body[field] === undefined) continue;
      let value = body[field];
      if (field === 'age') {
        value = parseInt(value, 10);
        if (Number.isNaN(value) || value < 18 || value > 99)
          return res.status(400).json({ error: 'العمر يجب أن يكون بين 18 و 99' });
      } else if (field === 'gender') {
        if (!GENDERS.includes(value))
          return res
            .status(400)
            .json({ error: 'يجب تحديد الجنس (ذكر أو أنثى)' });
      } else if (field === 'religious_commitment') {
        value = String(value || '').trim();
        if (value && !RELIGIOUS_LEVELS.includes(value))
          return res
            .status(400)
            .json({ error: 'قيمة مستوى الالتزام الديني غير صالحة' });
        value = value || null; // فارغ = مسح الحقل (اختياري)
      } else if (typeof value === 'string') {
        value = value.trim().slice(0, 2000) || null;
      }
      sets.push(`${field} = $${i++}`);
      values.push(value);
    }

    if (!sets.length)
      return res.status(400).json({ error: 'لا توجد بيانات لتحديثها' });

    values.push(req.userId);
    const { rows } = await query(
      `UPDATE profiles SET ${sets.join(', ')}, updated_at = now()
       WHERE user_id = $${i}
       RETURNING user_id, display_name, gender, age, city, nationality,
                 marital_status, education, bio, marriage_conditions,
                 religious_commitment,
                 (photo_path IS NOT NULL) AS has_photo, updated_at`,
      values
    );
    res.json({ profile: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/me/photo', authRequired, (req, res, next) => {
  uploadPhoto(req, res, async (err) => {
    if (err) return res.status(err.status || 400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'يرجى اختيار صورة' });
    try {
      const prev = await query(
        'SELECT photo_path FROM profiles WHERE user_id = $1',
        [req.userId]
      );
      await query(
        'UPDATE profiles SET photo_path = $1, updated_at = now() WHERE user_id = $2',
        [req.file.filename, req.userId]
      );
      const old = prev.rows[0]?.photo_path;
      if (old && old !== req.file.filename) {
        fs.promises.unlink(path.join(uploadsPath, old)).catch(() => {});
      }
      res.status(201).json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
});

export default router;
