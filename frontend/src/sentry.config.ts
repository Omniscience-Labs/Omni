import { consoleLoggingIntegration, type init } from '@sentry/nextjs';

type SentryConfig = Parameters<typeof init>[0];

export const SentryConfig: SentryConfig = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  _experiments: { enableLogs: true },
  integrations: [consoleLoggingIntegration()],
};
