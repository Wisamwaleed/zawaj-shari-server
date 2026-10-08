import multer from 'multer';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// حد مرتفع جداً عمداً: أي صورة هاتف حقيقية (حتى غير مضغوطة بدقة عالية جداً)
// يجب ألا تُرفض بسبب الحجم - فقط سقف أمان بعيد يمنع إساءة استخدام فعلية
// (رفع ملفات ضخمة عشوائية) دون التأثير على أي استخدام طبيعي.
export const MAX_PHOTO_BYTES = 100 * 1024 * 1024;

/**
 * رفع صورة شخصية واحدة بحقل باسم "photo" - في الذاكرة (req.file.buffer) وليس
 * على القرص، لأن المسار الحالي يعالجها بـ sharp ثم يرفعها إلى R2 مباشرة
 * (أو تخزين محلي للتطوير - انظر services/storage.js) دون أي ملف وسيط.
 */
export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('يُسمح فقط بصور JPG أو PNG أو WEBP أو HEIC'), { status: 400 }));
  },
}).single('photo');
