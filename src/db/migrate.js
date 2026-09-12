import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('تم إنشاء/تحديث الجداول بنجاح.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('فشلت الهجرة:', err.message);
  process.exit(1);
});
