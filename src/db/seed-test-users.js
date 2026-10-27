import bcrypt from 'bcryptjs';
import { pool, query } from './pool.js';
import { RELIGIOUS_LEVELS } from '../services/relations.js';

/**
 * يملأ قاعدة بيانات التجربة (staging) بحسابات اختبار تبدو طبيعية: نصفها إناث
 * ونصفها ذكور، بأسماء كاملة ونبذة متنوّعة، لتجربة التطبيق كأنه ممتلئ فعلاً.
 * الاستخدام: npm run seed-test-users [-- 200] [--refresh]
 *   --refresh: يعيد توليد بيانات الملفات (الأسماء والنبذة...) للحسابات الموجودة.
 *
 * حماية: يرفض العمل إلا على قاعدة اسمها zawaj_staging - لا يمكن أن يملأ قاعدة
 * الإنتاج (neondb) بحسابات وهمية يراها المستخدمون الحقيقيون ويراسلونها.
 * إعادة التشغيل آمنة: البريد فريد، والحسابات الموجودة تُتخطّى (أو تُحدَّث مع --refresh).
 * كل الحسابات: test.f001@test.zawajshari.org ... بكلمة مرور Test12345
 */

const ALLOWED_DB = 'zawaj_staging';
const PASSWORD = 'Test12345';
const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const total = Math.max(2, parseInt(args.find((a) => /^\d+$/.test(a)), 10) || 200);

// اسم أول + اسم عائلة - بلا أرقام حتى تبدو الأسماء طبيعية.
const FIRST_NAMES = {
  female: ['سارة', 'مريم', 'فاطمة', 'نور', 'هدى', 'آمنة', 'خديجة', 'زينب', 'رقية', 'أسماء', 'ليلى', 'سلمى', 'دعاء', 'إيمان', 'رنا', 'هاجر', 'يسرى', 'شيماء', 'منى', 'عائشة'],
  male: ['أحمد', 'محمد', 'عمر', 'علي', 'يوسف', 'خالد', 'عبدالله', 'إبراهيم', 'حسن', 'مصطفى', 'بلال', 'حمزة', 'طارق', 'سعيد', 'كريم', 'زياد', 'أنس', 'معاذ', 'ياسر', 'سامي'],
};
const FAMILY = ['الجبوري', 'العبيدي', 'الدليمي', 'الشمري', 'الحسيني', 'العاني', 'التميمي', 'الكبيسي', 'السامرائي', 'الراوي', 'القحطاني', 'العتيبي', 'الحربي', 'الزهراني', 'النعيمي', 'المصري', 'الخطيب', 'الحلبي', 'الشامي', 'البغدادي', 'الموصلي', 'الكردي', 'الأنصاري', 'الهاشمي', 'الصالح'];
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

// النبذة = عمل + هواية + ما يبحث عنه: مئات التركيبات بدل جمل قليلة مكرّرة.
const JOBS = {
  female: ['أعمل معلمة', 'أعمل صيدلانية', 'طالبة ماجستير', 'أعمل في مجال التصميم', 'ممرضة', 'أعمل محاسبة', 'مهندسة برمجيات', 'أعمل في البنك', 'خريجة إدارة أعمال', 'طبيبة أسنان', 'مدرّسة لغة عربية', 'أعمل في الترجمة من المنزل'],
  male: ['أعمل مهندساً مدنياً', 'طبيب', 'أعمل في التجارة', 'مدرّس', 'مبرمج', 'محاسب', 'أعمل في شركة نفط', 'صاحب محل', 'موظف حكومي', 'صيدلاني', 'مهندس كهرباء', 'أعمل في مجال التسويق'],
};
const HOBBIES = ['أحب القراءة', 'أحب السفر واكتشاف الأماكن', 'أهتم بالطبخ', 'أمارس الرياضة بانتظام', 'أحب الجلسات العائلية', 'أحفظ القرآن وأحضر الدروس', 'أحب الطبيعة والهدوء', 'أهتم بالتطوير الذاتي', 'أحب الخط العربي', 'أحب التصوير'];
const SEEKING = {
  female: ['أبحث عن زوج صالح يخاف الله ويحترم المرأة', 'أبحث عن شخص جاد ومتفاهم لبناء أسرة مستقرة', 'أريد زوجاً طيب القلب، حنوناً ومسؤولاً', 'أبحث عن رجل ملتزم يقدّر الحياة الزوجية', 'أتمنى شريكاً يعينني على الدين والدنيا'],
  male: ['أبحث عن زوجة صالحة تعين على طاعة الله', 'أريد شريكة حياة متفاهمة لبناء بيت سعيد', 'أبحث عن فتاة طيبة من عائلة محترمة', 'أبحث عن زوجة ملتزمة وهادئة الطباع', 'أتمنى شريكة تشاركني الطموح والاستقرار'],
};
const CONDITIONS = [
  'الدين والخلق أولاً.',
  'الجدية في الزواج واحترام الأهل.',
  'التفاهم والاحترام المتبادل.',
  'المحافظة على الصلاة.',
  'أن يكون التعارف بعلم الأهل.',
  'الصدق والوضوح من البداية.',
  'لا مانع من السكن في مدينة أخرى.',
  'القبول بإكمال الدراسة أو العمل بعد الزواج.',
];

const pick = (arr, i) => arr[i % arr.length];
const between = (min, max, i) => min + ((i * 7919) % (max - min + 1)); // توزيع ثابت قابل للتكرار
const fullName = (gender, n) => {
  const first = FIRST_NAMES[gender];
  return `${pick(first, n - 1)} ${pick(FAMILY, Math.floor((n - 1) / first.length) * 7 + n)}`;
};
const bio = (gender, i) =>
  `${pick(JOBS[gender], i)}، ${pick(HOBBIES, i * 3 + 1)}. ${pick(SEEKING[gender], i * 7 + 2)}.`;

/** قيم الملف الشخصي بترتيب أعمدة الإدخال/التحديث أدناه. */
function profileValues(gender, n) {
  const i = n + (gender === 'male' ? 1000 : 0);
  const [city, nationality] = pick(PLACES, i * 3);
  return [
    fullName(gender, n),
    gender,
    between(gender === 'female' ? 19 : 22, gender === 'female' ? 40 : 45, i),
    city,
    nationality,
    pick(MARITAL, i),
    pick(EDUCATION, i * 5),
    bio(gender, i),
    pick(CONDITIONS, i * 3 + 1),
    pick(RELIGIOUS_LEVELS, i),
    gender === 'female' ? between(150, 175, i) : between(162, 192, i),
    gender === 'female' ? between(48, 85, i) : between(60, 105, i),
    pick(SKIN_TONES, i * 3),
  ];
}

async function main() {
  const { rows: [{ db }] } = await query('SELECT current_database() AS db');
  if (db !== ALLOWED_DB) {
    throw new Error(`رفض: القاعدة الحالية "${db}" وليست "${ALLOWED_DB}". هذا السكربت للتجربة فقط.`);
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const perGender = Math.floor(total / 2);
  let created = 0;
  let updated = 0;

  for (const gender of ['female', 'male']) {
    for (let n = 1; n <= perGender; n++) {
      const tag = `${gender === 'female' ? 'f' : 'm'}${String(n).padStart(3, '0')}`;
      const email = `test.${tag}@test.zawajshari.org`;
      const profile = profileValues(gender, n);
      const ins = await query(
        `INSERT INTO users (email, password_hash, pledge_accepted_at, age_confirmed_at, referral_code, created_at)
         VALUES ($1, $2, now(), now(), $3, now() - ($4 || ' hours')::interval)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [email, hash, `T${tag.toUpperCase()}`, between(1, 240, n * 13)]
      );
      if (!ins.rowCount) {
        if (!refresh) continue;
        const upd = await query(
          `UPDATE profiles p SET display_name=$2, gender=$3, age=$4, city=$5, nationality=$6,
             marital_status=$7, education=$8, bio=$9, marriage_conditions=$10,
             religious_commitment=$11, height_cm=$12, weight_kg=$13, skin_tone=$14, updated_at=now()
           FROM users u WHERE u.id = p.user_id AND u.email = $1`,
          [email, ...profile]
        );
        updated += upd.rowCount;
        continue;
      }
      await query(
        `INSERT INTO profiles (user_id, display_name, gender, age, city, nationality, marital_status,
                               education, bio, marriage_conditions, religious_commitment,
                               height_cm, weight_kg, skin_tone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [ins.rows[0].id, ...profile]
      );
      created++;
    }
  }

  const { rows: [c] } = await query(
    `SELECT count(*) FILTER (WHERE p.gender='female')::int AS female,
            count(*) FILTER (WHERE p.gender='male')::int AS male,
            count(DISTINCT p.display_name)::int AS names
     FROM users u JOIN profiles p ON p.user_id = u.id
     WHERE u.email LIKE 'test.%@test.zawajshari.org'`
  );
  console.log(`أُنشئ ${created} وحُدِّث ${updated}. في "${db}": ${c.female} إناث، ${c.male} ذكور، ${c.names} اسماً مختلفاً.`);
  console.log(`الدخول: test.f001@test.zawajshari.org أو test.m001@test.zawajshari.org - كلمة المرور: ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('فشل:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
