/**
 * يمنح/يسحب صلاحية الإدارة (is_admin) من حساب موجود بالفعل، بالبريد الإلكتروني.
 * يُشغَّل يدوياً فقط من جهاز المطوّر (لا واجهة لمنح الإدارة من داخل التطبيق):
 *   node src/db/set-admin.js you@example.com        # يمنح
 *   node src/db/set-admin.js you@example.com off     # يسحب
 */
import { query, pool } from './pool.js';

const [email, mode] = process.argv.slice(2);
const grant = mode !== 'off';

async function main() {
  if (!email) {
    console.log('الاستخدام: node src/db/set-admin.js <email> [off]');
    return;
  }
  const { rows } = await query(
    'UPDATE users SET is_admin = $1 WHERE email = $2 RETURNING id, email, is_admin',
    [grant, email.trim().toLowerCase()]
  );
  if (!rows.length) {
    console.error(`لا يوجد حساب بهذا البريد: ${email}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    grant
      ? `✅ أصبح الحساب #${rows[0].id} (${rows[0].email}) مشرفاً.`
      : `تم سحب صلاحية الإشراف عن الحساب #${rows[0].id} (${rows[0].email}).`
  );
}

main()
  .catch((err) => {
    console.error('فشل:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
