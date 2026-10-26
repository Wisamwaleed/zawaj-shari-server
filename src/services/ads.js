import crypto from 'node:crypto';
import { pool, query } from '../db/pool.js';
import { httpError } from '../middleware/error.js';
import { getSettings } from './settings.js';
import { getEffectiveLimits, adRewardsClaimedToday } from './limits.js';

/**
 * إعلانات المكافأة (AdMob Rewarded): كل إعلان يُشاهَد كاملاً = طلب تعارف إضافي لليوم.
 *
 * التدفق:
 * 1) POST /api/ads/rewarded/session → nonce (يُمرَّر لـ AdMob كـ custom_data قبل تحميل الإعلان).
 * 2) بعد EARNED_REWARD في التطبيق → POST /api/ads/rewarded/claim { nonce }.
 * 3) (اختياري، يُفعَّل بـ ADS_REQUIRE_SSV=true) خوادم Google تستدعي GET /api/ads/ssv
 *    بتوقيع ECDSA؛ عندها لا تُمنح المكافأة إلا لجلسة وصل لها تأكيد موقَّع.
 * الحد اليومي ومدة الانتظار يُفرضان في السيرفر عند المنح، لا في التطبيق.
 */

const VERIFIER_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEYS_TTL_MS = 24 * 60 * 60 * 1000;

let keysCache = null;
let keysAt = 0;

async function adsConfig() {
  const s = await getSettings();
  return {
    enabled: s.ADS_ENABLED === 'true',
    dailyLimit: Math.max(0, parseInt(s.ADS_DAILY_LIMIT, 10) || 0),
    cooldownSeconds: Math.max(0, parseInt(s.ADS_COOLDOWN_SECONDS, 10) || 0),
    requireSsv: s.ADS_REQUIRE_SSV === 'true',
  };
}

async function secondsSinceLastClaim(userId) {
  const { rows } = await query(
    `SELECT EXTRACT(EPOCH FROM (now() - max(claimed_at)))::int AS s
     FROM ad_rewards WHERE user_id = $1 AND claimed_at IS NOT NULL`,
    [userId]
  );
  return rows[0].s; // null = لم يشاهد أي إعلان من قبل
}

/**
 * حالة الإعلانات لهذا المستخدم. available=false مع reason:
 * disabled | unlimited (لا حدود أصلاً: أنثى/مشترك/FREE_MODE) | daily_limit | cooldown
 */
export async function getRewardedStatus(userId) {
  const cfg = await adsConfig();
  const limits = await getEffectiveLimits(userId);
  const rewardsToday = limits.dailyRequests < 0 ? 0 : await adRewardsClaimedToday(userId);
  const since = await secondsSinceLastClaim(userId);
  const cooldownRemaining =
    since === null ? 0 : Math.max(0, cfg.cooldownSeconds - since);

  let reason = null;
  if (!cfg.enabled) reason = 'disabled';
  else if (limits.dailyRequests < 0) reason = 'unlimited';
  else if (rewardsToday >= cfg.dailyLimit) reason = 'daily_limit';
  else if (cooldownRemaining > 0) reason = 'cooldown';

  return {
    available: reason === null,
    reason,
    rewardsToday,
    dailyLimit: cfg.dailyLimit,
    cooldownRemainingSeconds: cooldownRemaining,
    reward: { type: 'extra_request', amount: 1 },
  };
}

/** يُنشئ جلسة إعلان (nonce) إن كان المستخدم مؤهلاً الآن. */
export async function createRewardedSession(userId) {
  const status = await getRewardedStatus(userId);
  if (!status.available) {
    throw httpError(429, rejectMessage(status), { code: 'AD_UNAVAILABLE' });
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  await query('INSERT INTO ad_rewards (user_id, nonce) VALUES ($1, $2)', [userId, nonce]);
  return { nonce };
}

/**
 * يمنح المكافأة لجلسة إعلان مكتملة. قفل استشاري لكل مستخدم داخل معاملة يمنع
 * تجاوز الحد اليومي بطلبات claim متزامنة.
 */
export async function claimRewardedSession(userId, nonce) {
  const cfg = await adsConfig();
  if (!cfg.enabled) throw httpError(403, 'الإعلانات غير متاحة حالياً', { code: 'AD_UNAVAILABLE' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [7301, userId]);

    const { rows } = await client.query(
      `SELECT id, claimed_at, ssv_verified_at FROM ad_rewards
       WHERE nonce = $1 AND user_id = $2 FOR UPDATE`,
      [String(nonce || ''), userId]
    );
    const session = rows[0];
    if (!session) throw httpError(404, 'جلسة الإعلان غير موجودة', { code: 'AD_SESSION_INVALID' });
    if (session.claimed_at) throw httpError(409, 'تم استلام هذه المكافأة مسبقاً', { code: 'AD_ALREADY_CLAIMED' });
    if (cfg.requireSsv && !session.ssv_verified_at) {
      // التأكيد الموقَّع من Google يصل عادةً خلال ثوانٍ - التطبيق يعيد المحاولة.
      throw httpError(425, 'جارٍ تأكيد مشاهدة الإعلان…', { code: 'AD_PENDING_VERIFICATION' });
    }

    const status = await getRewardedStatus(userId);
    if (!status.available) throw httpError(429, rejectMessage(status), { code: 'AD_UNAVAILABLE' });

    await client.query('UPDATE ad_rewards SET claimed_at = now() WHERE id = $1', [session.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return getRewardedStatus(userId);
}

function rejectMessage(status) {
  switch (status.reason) {
    case 'unlimited':
      return 'طلباتك غير محدودة أصلاً - لا حاجة لمشاهدة إعلان.';
    case 'daily_limit':
      return `شاهدت الحد الأقصى من الإعلانات اليوم (${status.dailyLimit}). عُد غداً.`;
    case 'cooldown':
      return `انتظر ${Math.ceil(status.cooldownRemainingSeconds / 60)} دقيقة قبل الإعلان التالي.`;
    default:
      return 'الإعلانات غير متاحة حالياً';
  }
}

async function getVerifierKeys(forceRefresh = false) {
  if (!forceRefresh && keysCache && Date.now() - keysAt < KEYS_TTL_MS) return keysCache;
  const res = await fetch(VERIFIER_KEYS_URL);
  if (!res.ok) throw new Error(`AdMob verifier keys HTTP ${res.status}`);
  const data = await res.json();
  keysCache = new Map((data.keys || []).map((k) => [String(k.keyId), k.pem]));
  keysAt = Date.now();
  return keysCache;
}

/**
 * يتحقق من توقيع استدعاء SSV من AdMob ويسجّل التأكيد على جلسة الإعلان.
 * الرسالة الموقَّعة = نص الاستعلام الخام كما وصل حتى ما قبل "&signature=".
 * (signature و key_id دائماً آخر معاملين حسب توثيق Google.)
 * @returns {boolean} true إن كان التوقيع صحيحاً
 */
export async function verifySsvCallback(rawQueryString, params) {
  const idx = rawQueryString.indexOf('&signature=');
  if (idx < 0 || !params.signature || !params.key_id) return false;
  const message = Buffer.from(rawQueryString.slice(0, idx), 'utf8');
  const signature = Buffer.from(String(params.signature), 'base64url');

  let keys = await getVerifierKeys();
  if (!keys.has(String(params.key_id))) keys = await getVerifierKeys(true); // تدوير المفاتيح
  const pem = keys.get(String(params.key_id));
  if (!pem) return false;

  const ok = crypto.verify('sha256', message, { key: pem, dsaEncoding: 'der' }, signature);
  if (!ok) return false;

  // اختبار "Verify callback URL" من لوحة AdMob يُرسل بلا custom_data - توقيع صحيح ولا شيء لتسجيله.
  if (params.custom_data && params.user_id) {
    await query(
      `UPDATE ad_rewards
       SET ssv_verified_at = now(), ssv_transaction_id = $3
       WHERE nonce = $1 AND user_id = $2 AND ssv_verified_at IS NULL`,
      [String(params.custom_data), Number(params.user_id) || 0, String(params.transaction_id || '')]
    );
  }
  return true;
}
