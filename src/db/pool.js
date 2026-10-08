import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

// Neon وأغلب مزودي PostgreSQL السحابيين يتطلبون SSL.
const needsSsl =
  /neon\.tech|render\.com|supabase|amazonaws\.com/.test(config.databaseUrl) ||
  process.env.PGSSL === 'true';

// نتحكم بـ SSL صراحةً عبر الخيار أدناه، لذا نزيل معاملات sslmode/channel_binding
// من رابط الاتصال لتفادي تحذير الإهمال في pg-connection-string.
const connectionString = config.databaseUrl.replace(
  /([?&])(sslmode|channel_binding)=[^&]*/gi,
  ''
).replace(/[?&]$/, '');

export const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  // إعدادات محافِظة تناسب خطة Neon المجانية/الصغيرة: عدد اتصالات متواضع
  // (Neon يحدّ عدد الاتصالات المتزامنة لكل فرع قاعدة بيانات)، مع إغلاق
  // الاتصالات الخاملة بسرعة حتى لا تُستهلَك الحصة من اتصالات خاملة بلا فائدة.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// خطأ في اتصال خامل (مثل انقطاع الشبكة من جهة Neon) لا يجب أن يُسقط العملية -
// pg يتولّى استبدال الاتصال التالف تلقائياً من الـ pool عند الطلب القادم.
pool.on('error', (err) => {
  console.error('خطأ غير متوقع في اتصال قاعدة البيانات (تم تجاهله، الـ pool يتعافى تلقائياً):', err.message);
});

/** غلاف مختصر لتنفيذ استعلام. */
export const query = (text, params) => pool.query(text, params);
