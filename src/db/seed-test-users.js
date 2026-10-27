import bcrypt from 'bcryptjs';
import { pool, query } from './pool.js';
import { RELIGIOUS_LEVELS } from '../services/relations.js';

/**
 * يملأ قاعدة بيانات التجربة (staging) بحسابات اختبار: نصفها إناث ونصفها ذكور.
 * الاستخدام: npm run seed-test-users [-- 200]
 *
 * حماية: يرفض العمل إلا على قاعدة اسمها zawaj_staging - لا يمكن أن يملأ قاعدة
 * الإنتاج (neondb) بحسابات وهمية يراها المستخدمون الحقيقيون ويراسلونها.
 * إعادة التشغيل آمنة: البريد فريد، والحسابات الموجودة تُتخطّى.
 * كل الحسابات: test.f001@test.zawajshari.org ... بكلمة مرور Test12345
 */

const ALLOWED_DB = 'zawaj_staging';
const PASSWORD = 'Test12345';
const total = Math.max(2, parseInt(process.argv[2], 10) || 200);

const FEMALE_NAMES = ['سارة', 'مريم', 'فاطمة', 'نور', 'هدى', 'آمنة', 'خديجة', 'زينب', 'رقية', 'أسماء', 'ليلى', 'سلمى', 'دعاء', 'إيمان', 'رنا', 'هاجر', 'يسرى', 'شيماء', 'منى', 'عائشة'];
const MALE_NAMES = ['أحمد', 'محمد', 'عمر', 'علي', 'يوسف', 'خالد', 'عبدالله', 'إبراهيم', 'حسن', 'مصطفى', 'بلال', 'حمزة', 'طارق', 'سعيد', 'كريم', 'زياد', 'أنس', 'معاذ', 'ياسر', 'سامي'];
const PLACES = [
  ['بغداد', 'عراقي'], ['أربيل', 'عراقي'], ['البصرة', 'عراقي'], ['الموصل', 'عراقي'],
  ['الرياض', 'سعودي'], ['جدة', 'سعودي'], ['عمّان', 'أردني'], ['دمشق', 'سوري'],
  ['القاهرة', 'مصري'], ['الإسكندرية', 'مصري'], ['الكويت', 'كويتي'], ['دبي', 'إماراتي'],
  ['الدوحة', 'قطري'], ['بيروت', 'لبناني'], ['الدار البيضاء', 'مغربي'], ['تونس', 'تونسي'],
  ['إسطنبول', 'تركي'], ['الجزائر', 'جزائري'],
];
const MARITAL = ['أعزب / عزباء', 'أعزب / عزباء', 'أعزب / عزباء', 'مطلّق / مطلّقة', 'أرمل / أرملة'];
const EDUCATION = ['ثانوي', 'دبلوم', 'بكالوريوس', 'بكالوريوس', 'ماجستير', 'دكتوراه'];
const SKIN_TONES = ['أبيض', 'حنطي فاتح', 'حنطي', 'أسمر فاتح', 'أسمر'];
const BIOS = [
  'أبحث عن شريك حياة صالح يعين على طاعة الله.',
  'هادئ الطباع، أحب القراءة والسفر، وأقدّر الاحترام المتبادل.',
  'ملتزم بالصلاة، أحب العائلة وأسعى لبناء بيت مستقر.',
  'أعمل في مجال التعليم، وأبحث عن زواج جاد بنية صادقة.',
  'بسيط ومتفاهم، أحب الطبخ والرياضة.',
];
const CONDITIONS = [
  'الدين والخلق أولاً.',
  'أن يكون جاداً في الزواج ومحترماً للأهل.',
  'التفاهم والاحترام المتبادل.',
  'الالتزام بالصلاة.',
];

const pick = (arr, i) => arr[i % arr.length];
const between = (min, max, i) => min + ((i * 7919) % (max - min + 1)); // توزيع ثابت قابل للتكرار

async function main() {
  const { rows: [{ db }] } = await query('SELECT current_database() AS db');
  if (db !== ALLOWED_DB) {
    throw new Error(`رفض: القاعدة الحالية "${db}" وليست "${ALLOWED_DB}". هذا السكربت للتجربة فقط.`);
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const perGender = Math.floor(total / 2);
  let created = 0;

  for (const gender of ['female', 'male']) {
    const names = gender === 'female' ? FEMALE_NAMES : MALE_NAMES;
    for (let n = 1; n <= perGender; n++) {
      const i = n + (gender === 'male' ? 1000 : 0);
      const email = `test.${gender === 'female' ? 'f' : 'm'}${String(n).padStart(3, '0')}@test.zawajshari.org`;
      const [city, nationality] = pick(PLACES, i * 3);
      const ins = await query(
        `INSERT INTO users (email, password_hash, pledge_accepted_at, age_confirmed_at, referral_code, created_at)
         VALUES ($1, $2, now(), now(), $3, now() - ($4 || ' hours')::interval)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [email, hash, `T${gender[0].toUpperCase()}${String(n).padStart(5, '0')}`, between(1, 240, i)]
      );
      if (!ins.rowCount) continue;
      await query(
        `INSERT INTO profiles (user_id, display_name, gender, age, city, nationality, marital_status,
                               education, bio, marriage_conditions, religious_commitment,
                               height_cm, weight_kg, skin_tone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          ins.rows[0].id,
          `${pick(names, n)} ${n}`,
          gender,
          between(gender === 'female' ? 19 : 22, gender === 'female' ? 40 : 45, i),
          city,
          nationality,
          pick(MARITAL, i),
          pick(EDUCATION, i * 5),
          pick(BIOS, i),
          pick(CONDITIONS, i * 2),
          pick(RELIGIOUS_LEVELS, i),
          gender === 'female' ? between(150, 175, i) : between(162, 192, i),
          gender === 'female' ? between(48, 85, i) : between(60, 105, i),
          pick(SKIN_TONES, i * 3),
        ]
      );
      created++;
    }
  }

  const { rows: [c] } = await query(
    `SELECT count(*) FILTER (WHERE p.gender='female')::int AS female,
            count(*) FILTER (WHERE p.gender='male')::int AS male
     FROM users u JOIN profiles p ON p.user_id = u.id
     WHERE u.email LIKE 'test.%@test.zawajshari.org'`
  );
  console.log(`أُنشئ ${created} حساباً جديداً. الإجمالي في "${db}": ${c.female} إناث، ${c.male} ذكور.`);
  console.log(`الدخول: test.f001@test.zawajshari.org أو test.m001@test.zawajshari.org - كلمة المرور: ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('فشل:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
