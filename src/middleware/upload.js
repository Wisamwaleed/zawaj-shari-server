import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config/index.js';

export const uploadsPath = path.resolve(config.uploadDir);
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `u${req.userId}_${Date.now()}${ext}`);
  },
});

// صور الكاميرا الحديثة (خصوصاً الهواتف عالية الدقة) قد تتجاوز 10 ميغابايت بسهولة
// حتى بجودة JPEG عادية؛ 20 ميغابايت تستوعب الغالبية العظمى منها دون رفض غير مبرَّر.
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

/** رفع صورة شخصية واحدة بحقل باسم "photo". */
export const uploadPhoto = multer({
  storage,
  limits: { fileSize: MAX_PHOTO_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('يُسمح فقط بصور JPG أو PNG أو WEBP'), { status: 400 }));
  },
}).single('photo');
