import { pool, query } from '../db/pool.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا أحرف/أرقام ملتبسة (O/0, I/1)
const CODE_LENGTH = 7;
const REFERRAL_REWARD_DAYS = 7;
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

/** معرّف الجهاز من رأس X-Device-Id (يرسله التطبيق)، أو null إن غاب أو كان غير صالح. */
export function deviceIdFrom(req) {
  const id = String(req.get('x-device-id') || '').trim();
  return DEVICE_ID_RE.test(id) ? id : null;
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
 * يربط المستخدم الجديد بصاحب كود الدعوة فقط (referred_by). لا مكافأة هنا: تُمنح
 * لاحقاً في qualifyReferral حين يُكمل المدعوّ ملفه من جهاز جديد - وإلا كان يكفي
 * إنشاء حسابات فارغة بالكود للحصول على Platinum.
 * لا يُفشل التسجيل أبداً إن كان الكود غير صالح - يُتجاهَل بصمت.
 */
export async function applyReferralCode(referralCode, newUserId) {
  const code = String(referralCode || '').trim().toUpperCase();
  if (!code) return;

  const { rows } = await query('SELECT id FROM users WHERE referral_code = $1', [code]);
  const referrer = rows[0];
  if (!referrer || referrer.id === newUserId) return; // كود غير موجود أو محاولة دعوة الذات

  await query('UPDATE users SET referred_by = $1 WHERE id = $2', [referrer.id, newUserId]);
}

/**
 * يمنح الداعي أسبوع Platinum - مرة واحدة في حياة حسابه - إن استوفى المدعوّ كل الشروط:
 * - سجّل بكود الداعي، ووافق على التعهّد، وأكمل ملفه (الاسم والجنس والعمر).
 * - من جهاز معروف (X-Device-Id) مختلف عن جهاز الداعي.
 * - وهذا الجهاز لم يُحتسب «صديقاً جديداً» لأي أحد من قبل (referral_devices، دائم).
 * يُستدعى بعد حفظ الملف وبعد التعهّد؛ آمن للاستدعاء المتكرر (لا يمنح مرتين).
 * @returns {boolean} true إن مُنحت المكافأة الآن
 */
export async function qualifyReferral(referredId) {
  const { rows } = await query(
    `SELECT u.referred_by, u.device_id, u.pledge_accepted_at,
            p.display_name, p.gender, p.age
     FROM users u JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [referredId]
  );
  const me = rows[0];
  if (!me?.referred_by || !me.device_id || !me.pledge_accepted_at) return false;
  if (!me.display_name || !me.gender || !me.age) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // قفل لكل داعٍ: مدعوّان يُكملان ملفيهما في نفس اللحظة لا يمنحان مكافأتين.
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [7302, me.referred_by]);

    const { rows: refRows } = await client.query(
      'SELECT device_id, is_banned, referral_rewarded_at FROM users WHERE id = $1',
      [me.referred_by]
    );
    const referrer = refRows[0];
    if (!referrer || referrer.is_banned || referrer.referral_rewarded_at) {
      await client.query('ROLLBACK');
      return false;
    }
    // نفس الهاتف = نفس الشخص على الأغلب (حساب ثانٍ لدعوة نفسه).
    if (referrer.device_id && referrer.device_id === me.device_id) {
      await client.query('ROLLBACK');
      return false;
    }
    const dev = await client.query(
      'INSERT INTO referral_devices (device_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING device_id',
      [me.device_id]
    );
    if (!dev.rowCount) {
      await client.query('ROLLBACK');
      return false; // هذا الهاتف احتُسب صديقاً جديداً من قبل
    }

    await client.query(
      `INSERT INTO referral_rewards (referrer_id, referred_id, reward_days)
       VALUES ($1, $2, $3) ON CONFLICT (referred_id) DO NOTHING`,
      [me.referred_by, referredId, REFERRAL_REWARD_DAYS]
    );
    // تمديد فوق أي اشتراك قائم: لا نُنزل Plus/Platinum مدفوعاً، ولا نقصّر مدة متبقية.
    await client.query(
      `UPDATE users
       SET referral_rewarded_at = now(),
           subscription_tier = 'platinum',
           subscription_expires_at = GREATEST(COALESCE(subscription_expires_at, now()), now())
                                     + ($1 || ' days')::interval
       WHERE id = $2`,
      [REFERRAL_REWARD_DAYS, me.referred_by]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * حالة الدعوة للمستخدم: كم شخصاً سجّل بكوده، هل حصل على المكافأة، وهل لديه
 * إشعار «صديقك انضم» لم يُعرض بعد (pendingReferralReward).
 */
export async function referralStats(userId) {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE referred_by = $1) AS referred_count,
       (SELECT referral_rewarded_at FROM users WHERE id = $1) AS rewarded_at,
       (SELECT count(*)::int FROM referral_rewards WHERE referrer_id = $1 AND notified_at IS NULL) AS pending`,
    [userId]
  );
  const r = rows[0];
  return {
    referredCount: r.referred_count,
    rewardDays: REFERRAL_REWARD_DAYS,
    referralRewarded: Boolean(r.rewarded_at),
    pendingReferralReward: r.pending > 0,
  };
}

/** يُسجَّل أن المستخدم رأى رسالة «صديقك انضم» حتى لا تتكرر. */
export async function ackReferralReward(userId) {
  await query(
    'UPDATE referral_rewards SET notified_at = now() WHERE referrer_id = $1 AND notified_at IS NULL',
    [userId]
  );
}
