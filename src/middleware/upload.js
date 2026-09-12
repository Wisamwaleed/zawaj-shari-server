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

/** رفع صورة شخصية واحدة بحقل باسم "photo". */
export const uploadPhoto = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 ميغابايت
  fileFilter: (req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('يُسمح فقط بصور JPG أو PNG أو WEBP'), { status: 400 }));
  },
}).single('photo');
