import { query } from '../db/pool.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا أحرف/أرقام ملتبسة (O/0, I/1)
const CODE_LENGTH = 7;
const REFERRAL_REWARD_DAYS = 7;

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** يولّد رمز دعوة فريد لمستخدم (يُستدعى عند التسجيل). إعادة محاولة نادرة عند تصادم. */
export async function generateReferralCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { rowCount } = await query('SELECT 1 FROM users WHERE referral_code = $1', [code]);
    if (!rowCount) return code;
  }
  // احتياط شبه مستحيل الحدوث: أطول قليلاً لضمان التفرّد.
  return randomCode() + randomCode().slice(0, 2);
}

/**
 * يطبّق كود دعوة عند تسجيل مستخدم جديد: يربط referred_by، ويمنح صاحب الكود
 * أسبوعاً من Platinum (يُمدَّد فوق اشتراكه الحالي إن كان نشطاً أصلاً).
 * لا يُفشل التسجيل أبداً إن كان الكود غير صالح - يُتجاهَل بصمت.
 */
export async function applyReferralCode(referralCode, newUserId) {
  const code = String(referralCode || '').trim().toUpperCase();
  if (!code) return;

  const { rows } = await query('SELECT id FROM users WHERE referral_code = $1', [code]);
  const referrer = rows[0];
  if (!referrer || referrer.id === newUserId) return; // كود غير موجود أو محاولة دعوة الذات

  await query('UPDATE users SET referred_by = $1 WHERE id = $2', [referrer.id, newUserId]);

  // UNIQUE(referred_id) يمنع منح المكافأة أكثر من مرة لنفس المدعوّ.
  const inserted = await query(
    `INSERT INTO referral_rewards (referrer_id, referred_id, reward_days)
     VALUES ($1, $2, $3)
     ON CONFLICT (referred_id) DO NOTHING
     RETURNING id`,
    [referrer.id, newUserId, REFERRAL_REWARD_DAYS]
  );
  if (!inserted.rowCount) return;

  await query(
    `UPDATE users
     SET subscription_tier = 'platinum',
         subscription_expires_at = GREATEST(
           COALESCE(subscription_expires_at, now()),
           now()
         ) + ($1 || ' days')::interval
     WHERE id = $2`,
    [REFERRAL_REWARD_DAYS, referrer.id]
  );
}

/** عدد الأشخاص الذين سجّلوا عبر كود هذا المستخدم وكافأوه فعلاً. */
export async function referralStats(userId) {
  const { rows } = await query(
    'SELECT count(*)::int AS n FROM referral_rewards WHERE referrer_id = $1',
    [userId]
  );
  return { referredCount: rows[0].n, rewardDays: REFERRAL_REWARD_DAYS };
}
