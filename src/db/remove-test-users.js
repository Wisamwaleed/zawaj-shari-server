import { pool, query } from './pool.js';

/**
 * يحذف كل حسابات الاختبار التي أنشأها seed-test-users (بريد *@test.zawajshari.org)
 * مع كل ما يرتبط بها (ملفات، طلبات، رسائل، زيارات، بلاغات...) عبر ON DELETE CASCADE.
 * الاستخدام: npm run remove-test-users  - شغّله قبل فتح التطبيق للعامة.
 */
async function main() {
  const { rows: [{ db }] } = await query('SELECT current_database() AS db');
  const { rowCount } = await query(
    "DELETE FROM users WHERE email LIKE 'test.%@test.zawajshari.org'"
  );
  const { rows: [left] } = await query('SELECT count(*)::int AS n FROM users');
  console.log(`حُذف ${rowCount} حساب اختبار من "${db}". المتبقّي: ${left.n} مستخدماً.`);
}

main()
  .catch((err) => {
    console.error('فشل:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
