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
  databaseUrl: cleanEnv(process.env.DATABASE_URL),
  jwtSecret: cleanEnv(process.env.JWT_SECRET) || 'dev_secret_change_me',
  jwtExpiresIn: cleanEnv(process.env.JWT_EXPIRES_IN) || '7d',
  clientOrigin: cleanEnv(process.env.CLIENT_ORIGIN) || 'http://localhost:5173',
  uploadDir: cleanEnv(process.env.UPLOAD_DIR) || 'uploads',
};

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
