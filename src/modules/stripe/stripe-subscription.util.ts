import { ParsedStripeSubscription } from './stripe.types';

export function extractStripeId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string'
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

export function stripeTimestampToDate(value: unknown): Date | null {
  if (typeof value === 'number') return new Date(value * 1000);
  return null;
}

/** Billing periods live on subscription items in Stripe API 2025-03-31+. */
export function parseBillingPeriods(data: Record<string, unknown>): {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
} {
  const items = data.items as { data?: Record<string, unknown>[] } | undefined;
  const itemPeriods = (items?.data ?? [])
    .map((item) => ({
      start: stripeTimestampToDate(item.current_period_start),
      end: stripeTimestampToDate(item.current_period_end),
    }))
    .filter((p) => p.start || p.end);

  const latestItem = itemPeriods.sort(
    (a, b) => (b.end?.getTime() ?? 0) - (a.end?.getTime() ?? 0),
  )[0];

  return {
    currentPeriodStart:
      latestItem?.start ?? stripeTimestampToDate(data.current_period_start),
    currentPeriodEnd:
      latestItem?.end ?? stripeTimestampToDate(data.current_period_end),
  };
}

export function parseStripeSubscriptionPayload(
  data: Record<string, unknown>,
): ParsedStripeSubscription {
  const items = data.items as
    | { data?: Array<{ price?: { id?: string } | string }> }
    | undefined;

  const firstItem = items?.data?.[0];
  const price = firstItem?.price;
  const priceId =
    typeof price === 'string'
      ? price
      : typeof price === 'object' && price?.id
        ? price.id
        : null;

  const { currentPeriodStart, currentPeriodEnd } = parseBillingPeriods(data);

  return {
    id: String(data.id ?? ''),
    customerId: extractStripeId(data.customer),
    status: String(data.status ?? ''),
    metadata: (data.metadata ?? {}) as { userId?: string; planId?: string },
    priceId,
    currentPeriodStart,
    currentPeriodEnd,
    cancelAtPeriodEnd: data.cancel_at_period_end === true,
    canceledAt: stripeTimestampToDate(data.canceled_at),
  };
}

export function parseInvoicePeriodEnd(
  data: Record<string, unknown>,
): Date | null {
  const lines = data.lines as
    | { data?: Array<{ period?: { end?: number } }> }
    | undefined;
  const ends = (lines?.data ?? [])
    .map((line) => stripeTimestampToDate(line.period?.end))
    .filter((d): d is Date => d !== null);

  if (ends.length) {
    return ends.sort((a, b) => b.getTime() - a.getTime())[0];
  }

  return stripeTimestampToDate(data.period_end);
}
