import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import { pledgeRequired } from './middleware/auth.js';
import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import photoRoutes from './routes/photos.routes.js';
import browseRoutes from './routes/browse.routes.js';
import requestRoutes from './routes/requests.routes.js';
import messageRoutes from './routes/messages.routes.js';
import moderationRoutes from './routes/moderation.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import visitsRoutes from './routes/visits.routes.js';

export const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// المصادقة فقط (متاحة قبل الموافقة على التعهّد: /auth/me و /auth/pledge).
app.use('/api/auth', authRoutes);

// بقية المسارات: تتطلب أن يكون المستخدم قد وافق على التعهّد (دفاع خلفي).
app.use('/api/profile', pledgeRequired, profileRoutes);
app.use('/api/photos', pledgeRequired, photoRoutes);
app.use('/api/browse', pledgeRequired, browseRoutes);
app.use('/api/requests', pledgeRequired, requestRoutes);
app.use('/api/messages', pledgeRequired, messageRoutes);
app.use('/api/moderation', pledgeRequired, moderationRoutes);
app.use('/api/subscription', pledgeRequired, subscriptionRoutes);
app.use('/api/visits', pledgeRequired, visitsRoutes);

app.use(notFound);
app.use(errorHandler);
