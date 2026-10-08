import { query } from '../db/pool.js';

/** القيم الافتراضية إن غاب المفتاح من الجدول لأي سبب (مثل قبل تشغيل migrate). */
const DEFAULTS = {
  FREE_MODE: 'true',
  MIN_VERSION_CODE: '1',
  LATEST_VERSION_CODE: '1',
  APK_URL: '',
  CHANGELOG: '',
};

const CACHE_TTL_MS = 15_000; // يكفي لتقليل الضغط على القاعدة دون تأخير ملموس عند تغيير إعداد
let cache = null;
let cacheAt = 0;

async function loadAll() {
  const { rows } = await query('SELECT key, value FROM app_settings');
  const map = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

/** كل الإعدادات الحالية (بتخزين مؤقت قصير). */
export async function getSettings() {
  const now = Date.now();
  if (!cache || now - cacheAt > CACHE_TTL_MS) {
    cache = await loadAll();
    cacheAt = now;
  }
  return cache;
}

/** إعداد واحد. */
export async function getSetting(key) {
  const all = await getSettings();
  return all[key] ?? DEFAULTS[key] ?? null;
}

export async function isFreeMode() {
  return (await getSetting('FREE_MODE')) === 'true';
}

/** يكتب إعداداً ويُبطل التخزين المؤقت فوراً. يُستخدَم من سكربت set-setting.js. */
export async function setSetting(key, value) {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
  cache = null;
}
