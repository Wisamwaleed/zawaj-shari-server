import dotenv from 'dotenv';

dotenv.config();

/**
 * تنظيف قيمة متغير بيئة: إزالة مسافات/أسطر زائدة وعلامات اقتباس محيطة
 * قد تُلصَق بالخطأ عند نسخ القيمة إلى بعض منصّات الاستضافة (Railway وغيرها)،
 * مثل `"postgresql://..."` بدل `postgresql://...`.
 */
function cleanEnv(value) {
  if (value == null) return '';
  return String(value).trim().replace(/^['"]|['"]$/g, '');
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: cleanEnv(process.env.NODE_ENV) || 'development',
  databaseUrl: cleanEnv(process.env.DATABASE_URL),
  jwtSecret: cleanEnv(process.env.JWT_SECRET) || 'dev_secret_change_me',
  jwtExpiresIn: cleanEnv(process.env.JWT_EXPIRES_IN) || '7d',
  clientOrigin: cleanEnv(process.env.CLIENT_ORIGIN) || 'http://localhost:5173',
  uploadDir: cleanEnv(process.env.UPLOAD_DIR) || 'uploads',

  sentryDsn: cleanEnv(process.env.SENTRY_DSN),

  // Cloudflare R2 (توافق S3). بلا هذه المتغيرات يعود رفع الصور تلقائياً
  // للتخزين على القرص المحلي (uploads/) - مفيد للتطوير المحلي بدون حساب R2.
  r2AccountId: cleanEnv(process.env.R2_ACCOUNT_ID),
  r2AccessKeyId: cleanEnv(process.env.R2_ACCESS_KEY_ID),
  r2SecretAccessKey: cleanEnv(process.env.R2_SECRET_ACCESS_KEY),
  r2Bucket: cleanEnv(process.env.R2_BUCKET_NAME),
};

config.r2Enabled = Boolean(
  config.r2AccountId && config.r2AccessKeyId && config.r2SecretAccessKey && config.r2Bucket
);

// فشل فوري وصريح بدل الإقلاع الصامت مع اتصال يفشل لاحقاً بـ ECONNREFUSED 127.0.0.1:5432.
// بدون DATABASE_URL يحاول pg الاتصال بقيمه الافتراضية (localhost) - وهذا أصل هذا الخطأ تحديداً.
if (!config.databaseUrl) {
  console.error(
    '\n❌ خطأ فادح: متغير DATABASE_URL غير مُعرَّف أو فارغ.\n' +
      '   بدونه سيحاول السيرفر الاتصال افتراضياً بـ 127.0.0.1:5432 ويفشل بالخطأ ECONNREFUSED.\n' +
      '   أضف DATABASE_URL في متغيرات البيئة لهذه الخدمة (على Railway: تبويب Variables) ثم أعد النشر.\n'
  );
  process.exit(1);
}
