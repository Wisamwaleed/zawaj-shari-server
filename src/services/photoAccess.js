import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

// توكن قصير العمر مخصّص لعرض صورة واحدة فقط - منفصل تماماً عن توكن الجلسة
// (7 أيام). حتى لو نُسخ رابط الصورة (uri الخاص بـ <Image>) فهو يتوقف عن
// العمل تلقائياً بعد انتهاء هذه المدة، بصرف النظر عن صلاحية جلسة المستخدم.
const PHOTO_TOKEN_TTL = '10m';

/** يوقّع توكناً لعرض صورة userId مُحدَّد من قِبل viewerId، بصيغة (full أو blurred). */
export function signPhotoToken({ viewerId, targetId, mode }) {
  return jwt.sign(
    { sub: viewerId, target: targetId, mode, purpose: 'photo' },
    config.jwtSecret,
    { expiresIn: PHOTO_TOKEN_TTL }
  );
}

/** يتحقق من توكن صورة. يرمي استثناءً إن كان منتهياً أو مزوّراً أو من غرض مختلف. */
export function verifyPhotoToken(token) {
  const payload = jwt.verify(token, config.jwtSecret);
  if (payload.purpose !== 'photo') throw new Error('invalid token purpose');
  return {
    viewerId: Number(payload.sub),
    targetId: Number(payload.target),
    mode: payload.mode === 'full' ? 'full' : 'blurred',
  };
}
