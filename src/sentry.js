import * as Sentry from '@sentry/node';
import { config } from './config/index.js';

/**
 * تهيئة اختيارية بالكامل: بلا SENTRY_DSN يعمل كل شيء بدون أي تأثير
 * (captureException تصبح no-op). لا تُضف أبداً أي سلوك يعتمد عليها بوجودها.
 */
export const sentryEnabled = Boolean(config.sentryDsn);

if (sentryEnabled) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    tracesSampleRate: 0.1,
  });
}

export function captureException(err, context) {
  if (!sentryEnabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
