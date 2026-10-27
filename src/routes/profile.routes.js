import { Router } from 'express';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { uploadPhoto, MAX_PHOTO_BYTES } from '../middleware/upload.js';
import { processPhoto } from '../services/photoProcessing.js';
import { putObject, storageBackend } from '../services/storage.js';
import { qualifyReferral } from '../services/referrals.js';
import {
  GENDERS,
  RELIGIOUS_LEVELS,
  SKIN_TONES,
  HEIGHT_MIN,
  HEIGHT_MAX,
  WEIGHT_MIN,
  WEIGHT_MAX,
} from '../services/relations.js';

const router = Router();

// أقل حجم معقول لملف صورة حقيقي - أي شيء أصغر على الأغلب ملف فارغ/تالف
// وليس صورة فعلية (انظر تعليق الفحص في /me/photo).
const MIN_PHOTO_BYTES = 5 * 1024;

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
  'height_cm',
  'weight_kg',
  'skin_tone',
];

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT user_id, display_name, gender, age, city, nationality,
              marital_status, education, bio, marriage_conditions,
              religious_commitment, height_cm, weight_kg, skin_tone,
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
      } else if (field === 'skin_tone') {
        value = String(value || '').trim();
        if (value && !SKIN_TONES.includes(value))
          return res.status(400).json({ error: 'قيمة لون البشرة غير صالحة' });
        value = value || null;
      } else if (field === 'height_cm' || field === 'weight_kg') {
        if (value === null || value === '') {
          value = null;
        } else {
          value = parseInt(value, 10);
          const [min, max] = field === 'height_cm' ? [HEIGHT_MIN, HEIGHT_MAX] : [WEIGHT_MIN, WEIGHT_MAX];
          if (Number.isNaN(value) || value < min || value > max)
            return res.status(400).json({
              error:
                field === 'height_cm'
                  ? `الطول يجب أن يكون بين ${HEIGHT_MIN} و ${HEIGHT_MAX} سم`
                  : `الوزن يجب أن يكون بين ${WEIGHT_MIN} و ${WEIGHT_MAX} كغ`,
            });
        }
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
                 religious_commitment, height_cm, weight_kg, skin_tone,
                 (photo_path IS NOT NULL) AS has_photo, updated_at`,
      values
    );
    // إكمال الملف أحد شروط مكافأة الدعوة لمن دعا هذا المستخدم (تُمنح مرة واحدة فقط).
    await qualifyReferral(req.userId);
    res.json({ profile: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.post('/me/photo', authRequired, (req, res, next) => {
  const startedAt = Date.now();
  uploadPhoto(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        const mb = Math.round(MAX_PHOTO_BYTES / (1024 * 1024));
        console.warn(`[upload] user=${req.userId} فشل: تجاوز الحجم الأقصى (${mb}MB)`);
        return res
          .status(413)
          .json({ error: `حجم الصورة كبير جداً. الحد الأقصى ${mb} ميغابايت.` });
      }
      console.warn(`[upload] user=${req.userId} فشل multer: ${err.message}`);
      return res.status(err.status || 400).json({ error: err.message });
    }
    if (!req.file) {
      console.warn(`[upload] user=${req.userId} فشل: لا يوجد ملف في الطلب`);
      return res.status(400).json({ error: 'يرجى اختيار صورة' });
    }
    const sizeKB = Math.round(req.file.size / 1024);
    console.log(
      `[upload] user=${req.userId} بدء المعالجة (${sizeKB}KB, ${req.file.mimetype}, تخزين=${storageBackend})`
    );

    // دفاع ضد ملف فارغ/شبه فارغ وصل سليماً عبر multer لكنه ليس صورة حقيقية
    // (مثلاً انقطاع أثناء القراءة على جهاز المُرسِل) - أفضل رفضه بوضوح الآن
    // من حفظ "صورة" تالفة لا تظهر لاحقاً بلا أي تفسير.
    if (req.file.size < MIN_PHOTO_BYTES) {
      console.warn(`[upload] user=${req.userId} فشل: حجم صغير جداً (${req.file.size} بايت)`);
      return res.status(400).json({ error: 'حجم الملف صغير جداً ليكون صورة صالحة. جرّب صورة أخرى.' });
    }

    let original, blurred;
    try {
      ({ original, blurred } = await processPhoto(req.file.buffer));
    } catch (e) {
      // فشل sharp بالذات = الملف ليس صورة قابلة للقراءة أصلاً - خطأ من
      // المستخدم (ملف تالف/صيغة غير مدعومة)، وليس خطأ سيرفر 500 عام.
      console.warn(`[upload] user=${req.userId} فشل: sharp تعذّر عليه قراءة الملف - ${e.message}`);
      return res.status(400).json({ error: 'تعذّر قراءة هذه الصورة. قد يكون الملف تالفاً، جرّب صورة أخرى.' });
    }

    try {
      // مفتاح ثابت لكل مستخدم (photos/{userId}/...) - كل رفع جديد يستبدل
      // نفس الكائنين في R2/التخزين المحلي تلقائياً، فلا حاجة لتتبّع اسم ملف
      // قديم أو حذفه يدوياً كما كان سابقاً.
      await Promise.all([
        putObject(`photos/${req.userId}/original.webp`, original, 'image/webp'),
        putObject(`photos/${req.userId}/blurred.webp`, blurred, 'image/webp'),
      ]);
      await query(
        'UPDATE profiles SET photo_path = $1, updated_at = now() WHERE user_id = $2',
        [String(Date.now()), req.userId]
      );
      console.log(`[upload] user=${req.userId} نجح (${Date.now() - startedAt}ms)`);
      res.status(201).json({ ok: true });
    } catch (e) {
      console.error(`[upload] user=${req.userId} فشل أثناء التخزين:`, e.message);
      next(e);
    }
  });
});

export default router;
