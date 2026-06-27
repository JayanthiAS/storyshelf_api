import { ParsedStripeSubscription } from '../stripe/stripe.types';

/** Minimal Stripe webhook event shape used across subscription handlers. */
export interface StripeWebhookEventPayload {
  id: string;
  type: string;
  data: {
    object: unknown;
  };
}

export type { ParsedStripeSubscription };
