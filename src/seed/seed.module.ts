import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { User, UserSchema } from '../modules/users/schemas/user.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanSchema,
} from '../modules/subscriptions/schemas/subscription-plan.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../modules/subscriptions/schemas/subscription.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  providers: [SeedService],
})
export class SeedModule {}
