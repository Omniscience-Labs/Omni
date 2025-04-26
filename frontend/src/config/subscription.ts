/**
 * Subscription configuration for the frontend.
 * These values should match the backend configuration.
 */

import { config, EnvMode } from '@/lib/config';

// Production tier IDs
const PROD_TIERS = {
  FREE: {
    priceId: 'price_1RGJ9GG6l1KZGqIroxSqgphC',
    name: 'Free',
    minutes: 8
  },
  BASE: {
    priceId: 'price_1RGJ9LG6l1KZGqIrd9pwzeNW',
    name: 'Base',
    minutes: 300
  },
  EXTRA: {
    priceId: 'price_1RGJ9JG6l1KZGqIrVUU4ZRv6',
    name: 'Extra',
    minutes: 2400
  }
} as const;

// Staging tier IDs
const STAGING_TIERS = {
  FREE: {
    priceId: 'price_1RDQbOG6l1KZGqIrgrYzMbnL',
    name: 'Free',
    minutes: 8
  },
  BASE: {
    priceId: 'price_1RC2PYG6l1KZGqIrpbzFB9Lp',
    name: 'Base',
    minutes: 300
  },
  EXTRA: {
    priceId: 'price_1RDQWqG6l1KZGqIrChli4Ys4',
    name: 'Extra',
    minutes: 2400
  }
} as const;

// Determine which tier set to use based on environment
export const SUBSCRIPTION_TIERS = config.ENV_MODE === EnvMode.STAGING ? STAGING_TIERS : PROD_TIERS;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS; 