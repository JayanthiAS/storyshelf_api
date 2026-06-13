import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionsService } from './subscriptions.service';
import {
  PlansPublicController,
  SubscriptionsController,
  PlansAdminController,
  SubscriptionsAdminController,
} from './subscriptions.controller';
import {
  SubscriptionPlan,
  SubscriptionPlanSchema,
} from './schemas/subscription-plan.schema';
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';
import {
  PaymentEvent,
  PaymentEventSchema,
} from './schemas/payment-event.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: PaymentEvent.name, schema: PaymentEventSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [
    PlansPublicController,
    SubscriptionsController,
    PlansAdminController,
    SubscriptionsAdminController,
  ],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
