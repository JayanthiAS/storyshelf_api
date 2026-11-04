import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectStripeClient } from '@golevelup/nestjs-stripe';
import Stripe from 'stripe';
import { PlanInterval } from '../../common/enums/plan-interval.enum';
import {
  StripeCheckoutSessionData,
  StripeCheckoutSessionInput,
  StripeCheckoutSessionResult,
  StripeCustomerInput,
  StripeProductPriceInput,
  StripeProductPriceResult,
} from './stripe.types';
import {
  extractStripeId,
  parseBillingPeriods,
  parseStripeSubscriptionPayload,
} from './stripe-subscription.util';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  constructor(
    @InjectStripeClient() private readonly client: InstanceType<typeof Stripe>,
    private configService: ConfigService,
  ) {}

  async createProductAndPrice(
    input: StripeProductPriceInput,
  ): Promise<StripeProductPriceResult | null> {
    if (input.price <= 0 || input.interval === PlanInterval.FREE) {
      return null;
    }

    try {
      const product = await this.client.products.create({ name: input.name });
      const price = await this.client.prices.create({
        product: product.id,
        unit_amount: Math.round(input.price * 100),
        currency: input.currency || 'usd',
        recurring:
          input.interval === PlanInterval.LIFETIME
            ? undefined
            : {
                interval: input.interval === PlanInterval.YEAR ? 'year' : 'month',
              },
      });

      return { productId: product.id, priceId: price.id };
    } catch (error) {
      this.logger.warn(
        `Stripe product/price creation failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async createCustomer(input: StripeCustomerInput): Promise<string> {
    try {
      const customer = await this.client.customers.create({
        email: input.email,
        name: input.name,
      });
      return customer.id;
    } catch (error) {
      this.logger.error(`Stripe customer creation failed: ${(error as Error).message}`);
      throw new BadRequestException('Stripe not configured');
    }
  }

  async createCheckoutSession(
    input: StripeCheckoutSessionInput,
  ): Promise<StripeCheckoutSessionResult> {
    const session = await this.client.checkout.sessions.create({
      customer: input.customerId,
      mode: 'subscription',
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: this.getSuccessRedirectUrl(),
      cancel_url: this.getCancelRedirectUrl(),
      metadata: { userId: input.userId, planId: input.planId },
      subscription_data: {
        metadata: { userId: input.userId, planId: input.planId },
      },
    });

    return { url: session.url, sessionId: session.id };
  }

  async createBillingPortalSession(customerId: string): Promise<{ url: string }> {
    const session = await this.client.billingPortal.sessions.create({
      customer: customerId,
      return_url: this.getPortalReturnUrl(),
    });
    return { url: session.url };
  }

  async retrieveCheckoutSession(sessionId: string): Promise<StripeCheckoutSessionData> {
    try {
      const session = await this.client.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      });
      return {
        id: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        metadata: {
          userId: session.metadata?.userId,
          planId: session.metadata?.planId,
        },
        subscriptionId: extractStripeId(session.subscription),
      };
    } catch {
      throw new BadRequestException('Invalid checkout session');
    }
  }

  async retrieveSubscription(subscriptionId: string): Promise<{
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  } | null> {
    try {
      const subscription = await this.client.subscriptions.retrieve(
        subscriptionId,
        { expand: ['items.data.price'] },
      );
      return parseBillingPeriods(
        subscription as unknown as Record<string, unknown>,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve Stripe subscription ${subscriptionId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async retrieveSubscriptionDetails(subscriptionId: string) {
    try {
      const subscription = await this.client.subscriptions.retrieve(
        subscriptionId,
        { expand: ['items.data.price'] },
      );
      return parseStripeSubscriptionPayload(
        subscription as unknown as Record<string, unknown>,
      );
    } catch {
      return null;
    }
  }

  async cancelSubscriptionAtPeriodEnd(stripeSubscriptionId: string): Promise<void> {
    try {
      await this.client.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      this.logger.warn(
        `Stripe subscription cancel failed: ${(error as Error).message}`,
      );
    }
  }

  getSuccessRedirectUrl(): string {
    return this.buildRedirectUrl(
      'STRIPE_SUCCESS_URL',
      'http://localhost:3001/subscription/success',
      true,
    );
  }

  getCancelRedirectUrl(): string {
    return this.buildRedirectUrl(
      'STRIPE_CANCEL_URL',
      'http://localhost:3001/subscription/cancel',
      false,
    );
  }

  getPortalReturnUrl(): string {
    return this.configService.get<string>(
      'STRIPE_PORTAL_RETURN_URL',
      'http://localhost:3001/account',
    );
  }

  private buildRedirectUrl(
    envKey: string,
    fallback: string,
    includeSessionPlaceholder: boolean,
  ): string {
    const configured = this.configService.get<string>(envKey, fallback);
    if (!includeSessionPlaceholder) {
      return configured;
    }
    if (configured.includes('{CHECKOUT_SESSION_ID}')) {
      return configured;
    }
    const separator = configured.includes('?') ? '&' : '?';
    return `${configured}${separator}session_id={CHECKOUT_SESSION_ID}`;
  }
}
