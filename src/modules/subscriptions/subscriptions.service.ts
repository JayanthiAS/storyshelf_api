import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
import { StripeService } from '../stripe/stripe.service';
import { ParsedStripeSubscription } from '../stripe/stripe.types';
import { StripeWebhookEventPayload } from './stripe-event.types';

interface CheckoutSessionPayload {
  metadata?: { userId?: string; planId?: string };
  subscription?: string | null;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectModel(SubscriptionPlan.name)
    private planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(Subscription.name)
    private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(PaymentEvent.name)
    private paymentEventModel: Model<PaymentEventDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private stripeService: StripeService,
    private rabbitMQService: RabbitMQService,
  ) {}

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

    const stripeRefs = await this.stripeService.createProductAndPrice({
      name: dto.name,
      price: dto.price,
      currency: dto.currency,
      interval: dto.interval,
    });

    return this.planModel.create({
      ...dto,
      slug,
      stripeProductId: stripeRefs?.productId ?? null,
      stripePriceId: stripeRefs?.priceId ?? null,
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
      .findOne({ userId: new Types.ObjectId(userId) })
      .populate('planId');
    if (!subscription) throw new NotFoundException('Subscription not found');

    const plan = subscription.planId as unknown as SubscriptionPlanDocument;
    const subscriptionObj = subscription.toObject() as unknown as Record<string, unknown>;
    delete subscriptionObj.planId;

    return {
      subscription: {
        ...subscriptionObj,
        planId: plan._id.toString(),
      },
      plan,
    };
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
      customerId = await this.stripeService.createCustomer({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      });
      user.stripeCustomerId = customerId;
      await user.save();
    }

    if (!plan.stripePriceId) {
      throw new BadRequestException('Plan not synced with Stripe');
    }

    return this.stripeService.createCheckoutSession({
      customerId,
      priceId: plan.stripePriceId,
      userId,
      planId: plan._id.toString(),
    });
  }

  async createPortal(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user?.stripeCustomerId) {
      throw new BadRequestException('No Stripe customer found');
    }
    return this.stripeService.createBillingPortalSession(user.stripeCustomerId);
  }

  async confirmCheckoutSuccess(sessionId: string, userId?: string) {
    this.logger.log(`Confirming checkout session ${sessionId}`);
    const session = await this.stripeService.retrieveCheckoutSession(sessionId);

    const sessionUserId = session.metadata.userId;
    if (!sessionUserId) {
      throw new BadRequestException('Checkout session is missing user metadata');
    }

    if (userId && sessionUserId !== userId) {
      throw new ForbiddenException('Checkout session does not belong to this user');
    }

    if (session.status !== 'complete') {
      throw new BadRequestException('Checkout session is not complete yet');
    }

    if (session.paymentStatus !== 'paid') {
      throw new BadRequestException('Payment was not completed');
    }

    await this.applyCheckoutSession({
      metadata: {
        userId: sessionUserId,
        planId: session.metadata.planId,
      },
      subscription: session.subscriptionId,
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
      await this.stripeService.cancelSubscriptionAtPeriodEnd(
        subscription.stripeSubscriptionId,
      );
    }

    subscription.cancelledAt = new Date();
    await subscription.save();
    return { message: 'Subscription will cancel at period end' };
  }

  async handleStripeEvent(event: StripeWebhookEventPayload): Promise<void> {
    const existing = await this.paymentEventModel.findOne({
      stripeEventId: event.id,
    });
    if (existing) {
      this.logger.debug(`Stripe event ${event.id} already processed`);
      return;
    }

    await this.paymentEventModel.create({
      stripeEventId: event.id,
      type: event.type,
      payload: event.data.object as Record<string, unknown>,
    });

    await this.processStripeEvent(
      event.type,
      event.data.object as Record<string, unknown>,
    );

    await this.rabbitMQService.publish(QUEUES.STRIPE_EVENTS, {
      eventId: event.id,
      type: event.type,
      data: event.data.object,
    });
  }

  async processStripeEvent(
    type: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(`Processing Stripe webhook event: ${type}`);

    switch (type) {
      case 'checkout.session.completed':
        await this.applyCheckoutSession(data as CheckoutSessionPayload);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.applyStripeSubscriptionUpdate(data);
        break;
      case 'customer.subscription.deleted':
        await this.applyStripeSubscriptionDeleted(data);
        break;
      case 'invoice.payment_succeeded':
        await this.applyInvoicePaymentSucceeded(data);
        break;
      case 'invoice.payment_failed':
        await this.applyInvoicePaymentFailed(data);
        break;
      default:
        this.logger.debug(`Ignoring unhandled Stripe event: ${type}`);
    }
  }

  private parseStripeSubscription(
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

    const customer = data.customer;
    const customerId =
      typeof customer === 'string'
        ? customer
        : typeof customer === 'object' &&
            customer &&
            'id' in customer &&
            typeof (customer as { id: unknown }).id === 'string'
          ? ((customer as { id: string }).id)
          : null;

    const toDate = (value: unknown): Date | null => {
      if (typeof value === 'number') return new Date(value * 1000);
      return null;
    };

    return {
      id: String(data.id ?? ''),
      customerId,
      status: String(data.status ?? ''),
      metadata: (data.metadata ?? {}) as { userId?: string; planId?: string },
      priceId,
      currentPeriodStart: toDate(data.current_period_start),
      currentPeriodEnd: toDate(data.current_period_end),
      cancelAtPeriodEnd: data.cancel_at_period_end === true,
      canceledAt: toDate(data.canceled_at),
    };
  }

  private mapStripeStatus(
    stripeStatus: string,
  ): SubscriptionStatus {
    switch (stripeStatus) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'past_due':
      case 'unpaid':
      case 'incomplete':
      case 'paused':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
      case 'incomplete_expired':
        return SubscriptionStatus.CANCELLED;
      default:
        return SubscriptionStatus.ACTIVE;
    }
  }

  private async findPlanByStripePriceId(priceId: string | null) {
    if (!priceId) return null;
    return this.planModel.findOne({
      stripePriceId: priceId,
      deletedAt: null,
      isActive: true,
    });
  }

  private async findDefaultFreePlan() {
    return this.planModel.findOne({
      isDefault: true,
      isActive: true,
      deletedAt: null,
    });
  }

  private async resolveSubscriptionRecord(
    stripeSub: ParsedStripeSubscription,
  ): Promise<{ subscription: SubscriptionDocument; userId: Types.ObjectId } | null> {
    if (stripeSub.metadata.userId) {
      const userId = new Types.ObjectId(stripeSub.metadata.userId);
      const subscription = await this.subscriptionModel.findOne({ userId });
      if (subscription) return { subscription, userId };
    }

    if (stripeSub.id) {
      const subscription = await this.subscriptionModel.findOne({
        stripeSubscriptionId: stripeSub.id,
      });
      if (subscription) return { subscription, userId: subscription.userId };
    }

    if (stripeSub.customerId) {
      const user = await this.userModel.findOne({
        stripeCustomerId: stripeSub.customerId,
      });
      if (user) {
        const subscription = await this.subscriptionModel.findOne({
          userId: user._id,
        });
        if (subscription) return { subscription, userId: user._id };
      }
    }

    return null;
  }

  private async syncUserPlan(
    userId: Types.ObjectId,
    subscription: SubscriptionDocument,
    planId: Types.ObjectId,
  ): Promise<void> {
    console.log("syncing user plan", userId, subscription, planId);
    await this.userModel.findByIdAndUpdate(userId, {
      subscriptionPlanId: planId,
      subscriptionId: subscription._id,
    });
  }

  private async applyStripeSubscriptionUpdate(
    data: Record<string, unknown>,
  ): Promise<void> {
    const stripeSub = this.parseStripeSubscription(data);
    if (!stripeSub.id) return;

    const resolved = await this.resolveSubscriptionRecord(stripeSub);
    console.log("resolved", resolved);
    if (!resolved) {
      this.logger.warn(
        `No local subscription found for Stripe subscription ${stripeSub.id}`,
      );
      return;
    }

    const { subscription, userId } = resolved;
    const planFromMetadata = stripeSub.metadata.planId
      ? await this.findPlanById(stripeSub.metadata.planId).catch(() => null)
      : null;
    console.log("planFromMetadata", planFromMetadata);
    const planFromPrice = await this.findPlanByStripePriceId(stripeSub.priceId);
    console.log("planFromPrice", planFromPrice);
    const plan = planFromMetadata ?? planFromPrice;

    if (plan && !plan.isDefault) {
      subscription.planId = plan._id;
    }

    subscription.stripeSubscriptionId = stripeSub.id;
    subscription.status = this.mapStripeStatus(stripeSub.status);

    if (stripeSub.currentPeriodStart) {
      subscription.currentPeriodStart = stripeSub.currentPeriodStart;
    }
    if (stripeSub.currentPeriodEnd) {
      subscription.currentPeriodEnd = stripeSub.currentPeriodEnd;
    }

    subscription.cancelledAt =
      stripeSub.cancelAtPeriodEnd || stripeSub.canceledAt
        ? stripeSub.canceledAt ?? new Date()
        : null;

    await subscription.save();
    await this.syncUserPlan(userId, subscription, subscription.planId);

    this.logger.log(
      `Synced Stripe subscription ${stripeSub.id} for user ${userId.toString()} — status ${subscription.status}`,
    );
  }

  private async applyStripeSubscriptionDeleted(
    data: Record<string, unknown>,
  ): Promise<void> {
    const stripeSub = this.parseStripeSubscription(data);
    const resolved = await this.resolveSubscriptionRecord(stripeSub);
    if (!resolved) return;

    const { subscription, userId } = resolved;
    const freePlan = await this.findDefaultFreePlan();
    if (!freePlan) {
      subscription.status = SubscriptionStatus.CANCELLED;
      subscription.cancelledAt = new Date();
      await subscription.save();
      return;
    }

    subscription.planId = freePlan._id;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.stripeSubscriptionId = null;
    subscription.cancelledAt = new Date();
    subscription.currentPeriodEnd = null;
    await subscription.save();
    await this.syncUserPlan(userId, subscription, freePlan._id);

    this.logger.log(
      `Downgraded user ${userId.toString()} to free plan after Stripe subscription deletion`,
    );
  }

  private async applyInvoicePaymentSucceeded(
    data: Record<string, unknown>,
  ): Promise<void> {
    const stripeSubId =
      typeof data.subscription === 'string' ? data.subscription : null;
    if (!stripeSubId) return;

    const subscription = await this.subscriptionModel.findOne({
      stripeSubscriptionId: stripeSubId,
    });
    if (!subscription) return;

    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.cancelledAt = null;
    await subscription.save();

    this.logger.log(
      `Payment succeeded — subscription ${stripeSubId} marked active`,
    );
  }

  private async applyInvoicePaymentFailed(
    data: Record<string, unknown>,
  ): Promise<void> {
    const stripeSubId =
      typeof data.subscription === 'string' ? data.subscription : null;
    if (!stripeSubId) return;

    const subscription = await this.subscriptionModel.findOne({
      stripeSubscriptionId: stripeSubId,
    });
    if (!subscription) return;

    subscription.status = SubscriptionStatus.PAST_DUE;
    await subscription.save();

    this.logger.warn(
      `Payment failed — subscription ${stripeSubId} marked past_due`,
    );
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

    if (alreadyApplied) {
      this.logger.debug(`Checkout session already applied for user ${userId}`);
      return;
    }

    subscription.planId = planObjectId;
    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.stripeSubscriptionId =
      typeof session.subscription === 'string' ? session.subscription : null;
    subscription.currentPeriodStart = new Date();
    subscription.cancelledAt = null;
    await subscription.save();

    await this.syncUserPlan(
      new Types.ObjectId(userId),
      subscription,
      planObjectId,
    );

    this.logger.log(
      `Subscription upgraded for user ${userId} to plan ${planId}`,
    );

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
