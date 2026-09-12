import http from 'node:http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { config } from './config/index.js';
import { pool } from './db/pool.js';
import { initChat } from './socket/chat.js';

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
