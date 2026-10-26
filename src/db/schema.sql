-- مخطط قاعدة بيانات "زواج شرعي" (MVP)
-- يُشغَّل عبر: npm run migrate

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- تعهد ما بعد التسجيل: تاريخ ووقت موافقة المستخدم (NULL = لم يوافق بعد).
ALTER TABLE users ADD COLUMN IF NOT EXISTS pledge_accepted_at TIMESTAMPTZ;

-- خطة الاشتراك: free | plus | platinum (الافتراضي عند التسجيل: free).
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free';

-- تاريخ ووقت انتهاء الاشتراك المدفوع (NULL لخطة free / أو اشتراك دائم).
-- بعد تجاوز هذا التاريخ يُعامَل المستخدم كأنه على free في كل الفحوصات.
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- يخدم platinumActiveSql/subscriberActiveSql المستخدَمة في كل استعلامات
-- التصفح والترشيحات (فلترة + ترتيب حسب حالة الاشتراك).
CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_tier, subscription_expires_at);

-- رمز دعوة فريد لكل مستخدم (يُولَّد عند التسجيل)، ومن دعاه إن سجّل عبر كود أحدهم.
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id);

-- SET NULL (بدل RESTRICT الافتراضي) حتى لا يمنع حذف حساب "داعٍ" حذفَ نفسه
-- بسبب وجود مدعوّين يشيرون إليه عبر referred_by.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_referred_by_fkey;
ALTER TABLE users ADD CONSTRAINT users_referred_by_fkey
  FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL;

-- تأكيد صريح عند التسجيل بأن المستخدم فوق 18 عاماً (إقرار ذاتي، وليس تحققاً
-- حقيقياً من الهوية) - يُسجَّل تاريخه كسجل قانوني/تدقيقي. NULL = لم يؤكد (حسابات قديمة).
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;

-- صلاحية الإشراف (لوحة الإدارة) - تُفعَّل يدوياً فقط عبر:
--   node src/db/set-admin.js <email>
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- إيقاف حساب من لوحة الإدارة (يمنع تسجيل الدخول واستخدام أي مسار محمي فوراً).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;

CREATE TABLE IF NOT EXISTS profiles (
  user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name        TEXT,
  gender              TEXT,          -- 'male' | 'female'
  age                 INTEGER,
  city                TEXT,
  nationality         TEXT,
  marital_status      TEXT,          -- أعزب/مطلق/أرمل ...
  education            TEXT,
  bio                 TEXT,
  marriage_conditions TEXT,
  -- لم يعد مساراً لملف محلي: مجرّد رقم إصدار (timestamp) يُستخدم كعلامة
  -- "توجد صورة" (NOT NULL) ولكسر التخزين المؤقت في العميل بعد كل رفع جديد.
  -- الصورتان الفعليتان مخزَّنتان في R2 (أو القرص محلياً بدون R2) بمفتاح ثابت:
  -- photos/{user_id}/original.webp و photos/{user_id}/blurred.webp
  photo_path          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- مستوى الالتزام الديني (اختياري): ملتزم جداً | ملتزم | متوسط الالتزام
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS religious_commitment TEXT;

-- حقول اختيارية إضافية: الطول (سم)، الوزن (كغ)، لون البشرة (نص ثابت من قائمة).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS height_cm INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weight_kg INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skin_tone TEXT;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_height_cm_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_height_cm_check
  CHECK (height_cm IS NULL OR (height_cm BETWEEN 140 AND 210));
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_weight_kg_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_weight_kg_check
  CHECK (weight_kg IS NULL OR (weight_kg BETWEEN 40 AND 150));

-- فهارس تخدم فلاتر التصفح الأساسية (الجنس دائماً في WHERE، والعمر الأكثر استخداماً).
CREATE INDEX IF NOT EXISTS idx_profiles_gender_age ON profiles(gender, age);
CREATE INDEX IF NOT EXISTS idx_profiles_religious ON profiles(religious_commitment);
CREATE INDEX IF NOT EXISTS idx_profiles_height ON profiles(height_cm);
CREATE INDEX IF NOT EXISTS idx_profiles_weight ON profiles(weight_kg);
CREATE INDEX IF NOT EXISTS idx_profiles_skin_tone ON profiles(skin_tone);

CREATE TABLE IF NOT EXISTS interest_requests (
  id          SERIAL PRIMARY KEY,
  sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id),
  CHECK (sender_id <> receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_requests_receiver ON interest_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_sender   ON interest_requests(sender_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES interest_requests(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- كل فحص حظر هنا يبحث بالاتجاهين (blocker أو blocked) - المفتاح الأساسي
-- يخدم جهة blocker_id فقط، فهرس إضافي على blocked_id يخدم الجهة الأخرى.
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

CREATE TABLE IF NOT EXISTS reports (
  id          SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- تصنيف البلاغ: inappropriate | fake | harassment | other
ALTER TABLE reports ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id, created_at);

-- مراجعة البلاغات من لوحة الإدارة: pending | resolved | dismissed
ALTER TABLE reports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- زيارات الملفات الشخصية (ميزة "من زار ملفك" لمشتركي Platinum).
-- صف واحد لكل زوج (زائر، مُزار) يُحدَّث تاريخه عند كل زيارة جديدة.
CREATE TABLE IF NOT EXISTS profile_visits (
  visitor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visited_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_id, visited_id),
  CHECK (visitor_id <> visited_id)
);

CREATE INDEX IF NOT EXISTS idx_visits_visited ON profile_visits(visited_id, created_at DESC);

-- مكافآت الدعوة: صف واحد لكل "مدعوّ" (referred_id UNIQUE) يمنع مكافأة الداعي أكثر
-- من مرة عن نفس الشخص، حتى لو أُعيد تشغيل منطق المكافأة لاحقاً.
CREATE TABLE IF NOT EXISTS referral_rewards (
  id          SERIAL PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_days INTEGER NOT NULL DEFAULT 7,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referred_id)
);

-- مكافآت إعلانات AdMob (Rewarded): صف لكل "جلسة إعلان" يُنشأ قبل تحميل الإعلان
-- (nonce يُمرَّر لـ AdMob كـ custom_data). reward_type: requests (+3 طلبات) أو
-- messages (+10 رسائل). claimed_at = مُنحت المكافأة فعلاً لليوم؛ ssv_verified_at = وصل تأكيد موقَّع من خوادم Google (Server-Side Verification).
CREATE TABLE IF NOT EXISTS ad_rewards (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce              TEXT NOT NULL UNIQUE,
  reward_type        TEXT NOT NULL DEFAULT 'requests' CHECK (reward_type IN ('requests', 'messages')),
  ssv_transaction_id TEXT UNIQUE,
  ssv_verified_at    TIMESTAMPTZ,
  claimed_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_rewards_user_claimed ON ad_rewards(user_id, claimed_at DESC);

-- رسائل نموذج «تواصل معنا» في الموقع (/contact) - تُعرض في لوحة الإدارة.
CREATE TABLE IF NOT EXISTS contact_messages (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  ip         TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);

-- إعدادات عامة للتطبيق يُعدَّلها المطوّر مباشرة (key/value، كل القيم نصوص).
-- انظر src/services/settings.js لقائمة المفاتيح المعروفة وقيمها الافتراضية.
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- القيم الافتراضية الحالية: التطبيق موزَّع كـ APK مباشر (لا Google Play بعد)
-- والاشتراك مجاني مؤقتاً للجميع (FREE_MODE) - انظر طلب المستخدم الأصلي.
INSERT INTO app_settings (key, value) VALUES
  ('FREE_MODE', 'true'),
  ('MIN_VERSION_CODE', '1'),
  ('LATEST_VERSION_CODE', '1'),
  ('APK_URL', ''),
  ('CHANGELOG', ''),
  ('ADS_ENABLED', 'true'),
  ('ADS_DAILY_LIMIT', '10'),
  ('ADS_COOLDOWN_SECONDS', '60'),
  ('ADS_REQUIRE_SSV', 'false'),
  ('ALLOW_DEMO_SUBSCRIPTIONS', 'false')
ON CONFLICT (key) DO NOTHING;
