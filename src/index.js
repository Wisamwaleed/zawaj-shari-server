import './sentry.js'; // يجب أن يكون أول استيراد حتى يلتقط أكبر قدر ممكن من الأخطاء
import http from 'node:http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { config } from './config/index.js';
import { pool } from './db/pool.js';
import { initChat } from './socket/chat.js';
import { captureException } from './sentry.js';

// شبكة أمان أخيرة: نسجّل الخطأ (ولـ Sentry إن كان مفعَّلاً) بدل انهيار العملية
// بصمت أو بتتبّع ضائع. على Node، استثناء متزامن غير مُلتَقَط يترك العملية في
// حالة غير موثوقة فعلياً، لذا نخرج بعد التسجيل لنترك المضيف (Railway) يعيد
// التشغيل بنسخة نظيفة - وهذا أأمن من الاستمرار بحالة فاسدة قد تُسبّب أخطاء
// أغمض لاحقاً. الوعود المرفوضة دون معالجة (غالباً خطأ برمجي في await مفقود)
// نكتفي بتسجيلها دون إيقاف العملية، لأنها أقل خطورة على حالة العملية عموماً.
process.on('uncaughtException', (err) => {
  console.error('خطأ غير مُلتَقَط (uncaughtException):', err);
  captureException(err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('وعد مرفوض دون معالجة (unhandledRejection):', reason);
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: config.clientOrigin },
});
initChat(io);
app.set('io', io); // متاح للمسارات عبر req.app.get('io')

server.listen(config.port, () => {
  console.log(`زواج شرعي - الخادم يعمل على المنفذ ${config.port}`);
});

async function shutdown() {
  console.log('\nإيقاف الخادم...');
  io.close();
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
