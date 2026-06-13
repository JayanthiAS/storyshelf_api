import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  SubscriptionPlan,
  SubscriptionPlanDocument,
} from './schemas/subscription-plan.schema';
import {
  Subscription,
  SubscriptionDocument,
} from './schemas/subscription.schema';
import {
  PaymentEvent,
  PaymentEventDocument,
} from './schemas/payment-event.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CheckoutDto,
  QueryDto,
} from './dto/subscription.dto';
import { toSlug } from '../../common/utils/helpers.util';
import {
  parsePagination,
  buildPaginatedResult,
} from '../../common/utils/pagination.util';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { PlanInterval } from '../../common/enums/plan-interval.enum';
import { RabbitMQService, QUEUES } from '../../common/services/rabbitmq.service';
import { NotificationType } from '../../common/enums/notification-type.enum';

interface CheckoutSessionPayload {
  metadata?: { userId?: string; planId?: string };
  subscription?: string | null;
}

@Injectable()
export class SubscriptionsService {
  private stripe: InstanceType<typeof Stripe>;

  constructor(
    @InjectModel(SubscriptionPlan.name)
    private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(PaymentEvent.name)
    private paymentEventModel: Model<PaymentEventDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
    private rabbitMQService: RabbitMQService,
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY', 'sk_test_placeholder'),
      { apiVersion: '2026-05-27.dahlia' },
    );
  }

  async hasActivePaidSubscription(userId: string): Promise<boolean> {
    const user = await this.userModel.findById(userId);
    if (!user?.subscriptionId) return false;
    const subscription = await this.subscriptionModel
      .findById(user.subscriptionId)
      .populate('planId');
    if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
      return false;
    }
    const plan = subscription.planId as unknown as SubscriptionPlanDocument;
    return plan?.unlocksLockedBooks === true;
  }

  async findAllPlans(publicOnly = true) {
    const filter: Record<string, unknown> = { deletedAt: null };
    if (publicOnly) filter.isActive = true;
    return this.planModel.find(filter).sort('price');
  }

  async findPlanById(id: string) {
    const plan = await this.planModel.findOne({ _id: id, deletedAt: null });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async createPlan(dto: CreatePlanDto) {
    const slug = toSlug(dto.name);
    if (dto.isDefault) {
      await this.planModel.updateMany({ isDefault: true }, { isDefault: false });
    }

    let stripeProductId: string | null = null;
    let stripePriceId: string | null = null;

    if (dto.price > 0 && dto.interval !== PlanInterval.FREE) {
      try {
        const product = await this.stripe.products.create({ name: dto.name });
        stripeProductId = product.id;
        const price = await this.stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(dto.price * 100),
          currency: dto.currency || 'usd',
          recurring:
            dto.interval === PlanInterval.LIFETIME
              ? undefined
              : { interval: dto.interval === PlanInterval.YEAR ? 'year' : 'month' },
        });
        stripePriceId = price.id;
      } catch {
        // Stripe not configured in dev
      }
    }

    return this.planModel.create({
      ...dto,
      slug,
      stripeProductId,
      stripePriceId,
      unlocksLockedBooks: dto.unlocksLockedBooks ?? dto.price > 0,
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.planModel.findOne({ _id: id, deletedAt: null });
    if (!plan) throw new NotFoundException('Plan not found');
    Object.assign(plan, dto);
    await plan.save();
    return plan;
  }

  async deletePlan(id: string) {
    const plan = await this.planModel.findOne({ _id: id, deletedAt: null });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.isDefault) {
      throw new BadRequestException('Cannot delete default plan');
    }
    plan.deletedAt = new Date();
    plan.isActive = false;
    await plan.save();
    return { message: 'Plan deactivated' };
  }

  async getMySubscription(userId: string) {
    const subscription = await this.subscriptionModel
      .findOne({ userId })
      .populate('planId');
    if (!subscription) throw new NotFoundException('Subscription not found');
    return subscription;
  }

  async createCheckout(userId: string, dto: CheckoutDto) {
    const plan = await this.findPlanById(dto.planId);
    if (plan.price === 0 || plan.interval === PlanInterval.FREE) {
      throw new BadRequestException('Cannot checkout free plan');
    }

    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      try {
        const customer = await this.stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
        });
        customerId = customer.id;
        user.stripeCustomerId = customerId;
        await user.save();
      } catch {
        throw new BadRequestException('Stripe not configured');
      }
    }

    if (!plan.stripePriceId) {
      throw new BadRequestException('Plan not synced with Stripe');
    }

    const successUrl = this.buildStripeRedirectUrl(
      'STRIPE_SUCCESS_URL',
      'http://localhost:3000/api/v1/subscriptions/success?session_id={CHECKOUT_SESSION_ID}',
      true,
    );
    const cancelUrl = this.buildStripeRedirectUrl(
      'STRIPE_CANCEL_URL',
      'http://localhost:3000/api/v1/subscriptions/cancel',
      false,
    );

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId, planId: plan._id.toString() },
    });

    return { url: session.url, sessionId: session.id };
  }

  async createPortal(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found');
    }
    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: this.configService.get('STRIPE_SUCCESS_URL'),
    });
    return { url: session.url };
  }

  private buildStripeRedirectUrl(
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

  async confirmCheckoutSuccess(sessionId: string, userId?: string) {
    let session: Awaited<
      ReturnType<InstanceType<typeof Stripe>['checkout']['sessions']['retrieve']>
    >;

    try {
      session = await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      throw new BadRequestException('Invalid checkout session');
    }

    const sessionUserId = session.metadata?.userId;
    if (!sessionUserId) {
      throw new BadRequestException('Checkout session is missing user metadata');
    }

    if (userId && sessionUserId !== userId) {
      throw new ForbiddenException('Checkout session does not belong to this user');
    }

    if (session.status !== 'complete') {
      throw new BadRequestException('Checkout session is not complete yet');
    }

    if (session.payment_status !== 'paid') {
      throw new BadRequestException('Payment was not completed');
    }

    await this.applyCheckoutSession({
      metadata: {
        userId: sessionUserId,
        planId: session.metadata?.planId,
      },
      subscription:
        typeof session.subscription === 'string' ? session.subscription : null,
    });

    const subscription = await this.subscriptionModel
      .findOne({ userId: new Types.ObjectId(sessionUserId) })
      .populate('planId');

    const plan = subscription?.planId as unknown as SubscriptionPlanDocument;

    return {
      message: 'Subscription activated successfully',
      sessionId: session.id,
      subscription,
      plan: plan
        ? {
            id: plan._id,
            name: plan.name,
            unlocksLockedBooks: plan.unlocksLockedBooks,
          }
        : null,
    };
  }

  async handleCheckoutCancel(userId?: string) {
    if (userId) {
      const subscription = await this.getMySubscription(userId);
      return {
        message: 'Checkout was cancelled. Your subscription is unchanged.',
        subscription,
      };
    }

    return {
      message: 'Checkout was cancelled. You can try again anytime.',
    };
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.subscriptionModel.findOne({ userId });
    if (!subscription) throw new NotFoundException('Subscription not found');

    if (subscription.stripeSubscriptionId) {
      try {
        await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      } catch {
        // ignore in dev
      }
    }

    subscription.cancelledAt = new Date();
    await subscription.save();
    return { message: 'Subscription will cancel at period end' };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    let event: ReturnType<InstanceType<typeof Stripe>['webhooks']['constructEvent']>;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret || 'whsec_placeholder',
      );
    } catch {
      throw new BadRequestException('Invalid webhook signature');
    }

    const existing = await this.paymentEventModel.findOne({
      stripeEventId: event.id,
    });
    if (existing) return { received: true };

    await this.paymentEventModel.create({
      stripeEventId: event.id,
      type: event.type,
      payload: event.data.object as unknown as Record<string, unknown>,
    });

    await this.rabbitMQService.publish(QUEUES.STRIPE_EVENTS, {
      eventId: event.id,
      type: event.type,
      data: event.data.object,
    });

    if (event.type === 'checkout.session.completed') {
      await this.applyCheckoutSession(
        event.data.object as CheckoutSessionPayload,
      );
    }

    return { received: true };
  }

  private async applyCheckoutSession(session: CheckoutSessionPayload) {
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    if (!userId || !planId) return;

    const subscription = await this.subscriptionModel.findOne({
      userId: new Types.ObjectId(userId),
    });
    if (!subscription) return;

    const planObjectId = new Types.ObjectId(planId);
    const alreadyApplied =
      subscription.planId.equals(planObjectId) &&
      subscription.status === SubscriptionStatus.ACTIVE &&
      (session.subscription
        ? subscription.stripeSubscriptionId === session.subscription
        : true);

    if (alreadyApplied) return;

    subscription.planId = planObjectId;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.stripeSubscriptionId =
      typeof session.subscription === 'string' ? session.subscription : null;
    subscription.currentPeriodStart = new Date();
    subscription.cancelledAt = null;
    await subscription.save();

    await this.userModel.findByIdAndUpdate(userId, {
      subscriptionPlanId: planId,
      subscriptionId: subscription._id,
    });

    await this.rabbitMQService.publish(QUEUES.NOTIFICATIONS_SEND, {
      userId,
      type: NotificationType.SUBSCRIPTION,
      title: 'Subscription Upgraded',
      body: 'Your subscription has been upgraded successfully.',
    });
  }

  async findAllSubscriptions(query: QueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.planId) filter.planId = new Types.ObjectId(query.planId);
    const [data, total] = await Promise.all([
      this.subscriptionModel
        .find(filter)
        .populate('userId', 'email firstName lastName')
        .populate('planId', 'name price')
        .skip(skip)
        .limit(limit),
      this.subscriptionModel.countDocuments(filter),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async getUserSubscriptionHistory(userId: string) {
    return this.subscriptionModel
      .find({ userId })
      .populate('planId')
      .sort('-createdAt');
  }
}
