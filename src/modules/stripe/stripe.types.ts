import { PlanInterval } from '../../common/enums/plan-interval.enum';

export interface StripeProductPriceInput {
  name: string;
  price: number;
  currency?: string;
  interval: PlanInterval;
}

export interface StripeProductPriceResult {
  productId: string;
  priceId: string;
}

export interface StripeCustomerInput {
  email: string;
  name: string;
}

export interface StripeCheckoutSessionInput {
  customerId: string;
  priceId: string;
  userId: string;
  planId: string;
}

export interface StripeCheckoutSessionResult {
  url: string | null;
  sessionId: string;
}

export interface StripeCheckoutSessionData {
  id: string;
  status: string | null;
  paymentStatus: string | null;
  metadata: { userId?: string; planId?: string };
  subscriptionId: string | null;
}

export interface ParsedStripeSubscription {
  id: string;
  customerId: string | null;
  status: string;
  metadata: { userId?: string; planId?: string };
  priceId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
}
