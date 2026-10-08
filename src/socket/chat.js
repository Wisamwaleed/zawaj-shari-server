import { verifyToken } from '../utils/jwt.js';
import { query } from '../db/pool.js';
import { createMessage } from '../services/messages.js';
import { getAcceptedRequestForUser } from '../services/relations.js';
import { captureException } from '../sentry.js';

/**
 * دردشة فورية. كل مستخدم ينضم لغرفته الخاصة `user:<id>`،
 * ولغرفة كل محادثة `req:<requestId>` يشارك فيها بعد قبول التعارف.
 */
export function initChat(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const userId = Number(verifyToken(token).sub);
      // دفاع خلفي: لا اتصال قبل الموافقة على التعهّد.
      const { rows } = await query(
        'SELECT pledge_accepted_at FROM users WHERE id = $1',
        [userId]
      );
      if (!rows.length || rows[0].pledge_accepted_at == null) {
        return next(new Error('pledge_required'));
      }
      socket.userId = userId;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    // الانضمام لغرفة محادثة بعد التحقق من الصلاحية.
    socket.on('chat:join', async (requestId, cb) => {
      try {
        const request = await getAcceptedRequestForUser(
          Number(requestId),
          socket.userId
        );
        if (!request) return cb?.({ error: 'غير مصرح بهذه المحادثة' });
        socket.join(`req:${requestId}`);
        cb?.({ ok: true });
      } catch (err) {
        captureException(err, { event: 'chat:join', userId: socket.userId });
        cb?.({ error: 'تعذّر الانضمام للمحادثة' });
      }
    });

    socket.on('chat:leave', (requestId) => {
      socket.leave(`req:${requestId}`);
    });

    // إرسال رسالة: التحقق داخل createMessage ثم البث للغرفة.
    socket.on('chat:message', async (payload, cb) => {
      try {
        const { message, recipientId } = await createMessage({
          requestId: Number(payload?.requestId),
          senderId: socket.userId,
          body: payload?.body,
        });
        io.to(`req:${message.request_id}`).emit('chat:message', message);
        // إشعار خفيف للطرف الآخر إن لم يكن داخل الغرفة.
        io.to(`user:${recipientId}`).emit('chat:notify', {
          requestId: message.request_id,
        });
        cb?.({ ok: true, message });
      } catch (err) {
        if (!err.status || err.status >= 500) {
          captureException(err, { event: 'chat:message', userId: socket.userId });
        }
        cb?.({ error: err.message || 'تعذّر إرسال الرسالة', code: err.code });
      }
    });
  });
}
