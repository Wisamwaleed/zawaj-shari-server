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
  photo_path          TEXT,          -- اسم الملف داخل مجلد uploads
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- مستوى الالتزام الديني (اختياري): ملتزم جداً | ملتزم | متوسط الالتزام
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS religious_commitment TEXT;

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
