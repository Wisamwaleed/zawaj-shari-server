import { pool, query } from './pool.js';

/**
 * يحذف كل حسابات الاختبار التي أنشأها seed-test-users (بريد *@test.zawajshari.org)
 * مع كل ما يرتبط بها (ملفات، طلبات، رسائل، زيارات، بلاغات...) عبر ON DELETE CASCADE.
 * الاستخدام: npm run remove-test-users  - شغّله قبل فتح التطبيق للعامة.
 * لحذف جنس واحد فقط: npm run remove-test-users -- --gender=male (أو female)
 */
async function main() {
  const genderArg = process.argv.find((a) => a.startsWith('--gender='));
  const gender = genderArg ? genderArg.split('=')[1] : null;
  if (gender && !['male', 'female'].includes(gender)) {
    throw new Error('--gender يجب أن يكون male أو female');
  }

  const { rows: [{ db }] } = await query('SELECT current_database() AS db');
  const { rowCount } = gender
    ? await query(
        `DELETE FROM users u USING profiles p
          WHERE p.user_id = u.id AND p.gender = $1
            AND u.email LIKE 'test.%@test.zawajshari.org'`,
        [gender]
      )
    : await query("DELETE FROM users WHERE email LIKE 'test.%@test.zawajshari.org'");
  const { rows: [left] } = await query('SELECT count(*)::int AS n FROM users');
  console.log(
    `حُذف ${rowCount} حساب اختبار${gender ? ` (${gender})` : ''} من "${db}". المتبقّي: ${left.n} مستخدماً.`
  );
}

main()
  .catch((err) => {
    console.error('فشل:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
