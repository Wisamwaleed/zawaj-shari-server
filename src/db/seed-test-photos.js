import sharp from 'sharp';
import { pool, query } from './pool.js';
import { putObject } from '../services/storage.js';
import { processPhoto } from '../services/photoProcessing.js';

/**
 * يضع صورة رمزية مرسومة (امرأة بحجاب، بلا ملامح وجه) لكل حساب اختبار بلا صورة،
 * عبر نفس معالجة الرفع الحقيقي (original + blurred) - لاختبار عرض الصور وتمويهها
 * ومراجعة المشرف. رسم وليس صورة لشخص حقيقي، حتى لا يُظنّ الحساب امرأة حقيقية.
 * الاستخدام: npm run seed-test-photos  (يمسّ حسابات *@test.zawajshari.org فقط)
 */
const HIJABS = [
  ['#1F3A5F', '#162B47'], ['#6B2D3C', '#52212D'], ['#2F5D50', '#22463C'],
  ['#C8A2A8', '#A9858B'], ['#3C3C3C', '#262626'], ['#8C6A4F', '#6E523C'],
  ['#4B3F72', '#382F57'], ['#D9C7A7', '#BFAE8E'], ['#7A8B99', '#5F6E7A'],
  ['#A0522D', '#7E4023'], ['#264653', '#1B333C'], ['#B5838D', '#966A73'],
];
const BACKGROUNDS = [
  ['#F6E7D8', '#EBC9A9'], ['#E3EEF5', '#BFD5E6'], ['#EAF2E3', '#C9DDB8'],
  ['#F3E5EC', '#E0C2D1'], ['#FFF4D6', '#F2DC9B'], ['#E8E4F3', '#CBC2E5'],
  ['#F1ECE6', '#D9CFC3'],
];
const SKINS = ['#F2D3B8', '#E8BE9A', '#D6A27C', '#C48B63', '#A8714D', '#F5DCC8'];
const CLOTHES = ['#2E2E38', '#5A4632', '#3B4A5A', '#6E5A6B', '#45584B', '#7D5E4F'];

const pick = (arr, i) => arr[i % arr.length];

function avatarSvg(i) {
  const [hijab, hijabDark] = pick(HIJABS, i * 5 + 1);
  const [bg1, bg2] = pick(BACKGROUNDS, i * 3);
  const skin = pick(SKINS, i * 7 + 2);
  const cloth = pick(CLOTHES, i * 11 + 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <path d="M110 800 C130 610 260 545 400 545 C540 545 670 610 690 800 Z" fill="${cloth}"/>
  <path d="M400 165 C285 165 222 262 228 375 C233 470 268 540 300 585 C330 640 470 640 500 585 C532 540 567 470 572 375 C578 262 515 165 400 165 Z" fill="${hijab}"/>
  <path d="M262 520 C300 640 500 640 538 520 L585 640 C500 715 300 715 215 640 Z" fill="${hijab}"/>
  <ellipse cx="400" cy="372" rx="92" ry="116" fill="${skin}"/>
  <path d="M302 345 C312 250 488 250 498 345 C468 292 332 292 302 345 Z" fill="${hijabDark}"/>
  <path d="M228 375 C233 470 268 540 300 585 C290 520 300 450 310 400 Z" fill="${hijabDark}" opacity="0.35"/>
</svg>`;
}

async function main() {
  const { rows } = await query(
    `SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE u.email LIKE 'test.%@test.zawajshari.org' AND p.photo_path IS NULL
      ORDER BY u.id`
  );
  let done = 0;
  for (const { id } of rows) {
    const png = await sharp(Buffer.from(avatarSvg(id))).png().toBuffer();
    const { original, blurred } = await processPhoto(png);
    await putObject(`photos/${id}/original.webp`, original, 'image/webp');
    await putObject(`photos/${id}/blurred.webp`, blurred, 'image/webp');
    await query('UPDATE profiles SET photo_path = $1, updated_at = now() WHERE user_id = $2', [
      String(Date.now()),
      id,
    ]);
    done++;
  }
  console.log(`أُضيفت صور رمزية لـ ${done} حساب اختبار.`);
}

main()
  .catch((err) => {
    console.error('فشل:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
