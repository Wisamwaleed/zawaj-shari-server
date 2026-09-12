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
});

pool.on('error', (err) => {
  console.error('خطأ غير متوقع في اتصال قاعدة البيانات:', err);
});

/** غلاف مختصر لتنفيذ استعلام. */
export const query = (text, params) => pool.query(text, params);
