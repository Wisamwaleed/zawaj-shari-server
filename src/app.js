import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { pool } from './db/pool.js';
import { notFound, errorHandler } from './middleware/error.js';
import { pledgeRequired } from './middleware/auth.js';
import { MAX_PHOTO_BYTES } from './middleware/upload.js';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import photoRoutes from './routes/photos.routes.js';
import browseRoutes from './routes/browse.routes.js';
import requestRoutes from './routes/requests.routes.js';
import messageRoutes from './routes/messages.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import visitsRoutes from './routes/visits.routes.js';
import appVersionRoutes from './routes/appVersion.routes.js';
import downloadRoutes from './routes/download.routes.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(dir, '..', 'public')));

// حد عام يمنع الإغراق: 300 طلب/15 دقيقة لكل IP لكل مسارات /api.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة جداً. حاول مرة أخرى بعد قليل.' },
});
// حد أشد خصوصاً على تسجيل الدخول/التسجيل - أهم مسارين لهجمات التخمين.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'محاولات كثيرة جداً. حاول مرة أخرى بعد 15 دقيقة.' },
});
app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// /health (وليس فقط /api/health) لسهولة إشارة إليه من أدوات المراقبة
// (UptimeRobot وغيرها) - يفحص قاعدة البيانات فعلياً وليس فقط أن العملية حيّة.
app.get(['/health', '/api/health'], async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'down', error: err.message });
  }
});

// عامة بلا مصادقة عمداً: تحديث التطبيق وصفحة التنزيل يجب أن يعملا حتى قبل تسجيل الدخول.
app.use('/api/app-version', appVersionRoutes);
app.use('/download', downloadRoutes);

// نقطة تشخيص: تكشف فوراً إن كان النشر الحالي على Railway يحمل آخر تعديلات الكود
// (مثل رفع حد حجم الصورة) أم لا يزال إصداراً قديماً. 404 على هذا المسار نفسه = نشر قديم.
const bootedAt = new Date().toISOString();
app.get('/api/version', (req, res) =>
  res.json({
    bootedAt,
    maxPhotoUploadMB: Math.round(MAX_PHOTO_BYTES / (1024 * 1024)),
  })
);

// المصادقة فقط (متاحة قبل الموافقة على التعهّد: /auth/me و /auth/pledge).
app.use('/api/auth', authRoutes);

// بقية المسارات: تتطلب أن يكون المستخدم قد وافق على التعهّد (دفاع خلفي).
app.use('/api/profile', pledgeRequired, profileRoutes);
app.use('/api/photos', pledgeRequired, photoRoutes);
app.use('/api/browse', pledgeRequired, browseRoutes);
app.use('/api/requests', pledgeRequired, requestRoutes);
app.use('/api/messages', pledgeRequired, messageRoutes);
app.use('/api/moderation', pledgeRequired, moderationRoutes);
app.use('/api/subscription', pledgeRequired, subscriptionRoutes);
app.use('/api/visits', pledgeRequired, visitsRoutes);

app.use(notFound);
app.use(errorHandler);
