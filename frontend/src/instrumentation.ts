import * as Sentry from '@sentry/nextjs';
import { SentryConfig } from './sentry.config';

export async function register() {
  Sentry.init(SentryConfig);
}

export const onRequestError = Sentry.captureRequestError;
