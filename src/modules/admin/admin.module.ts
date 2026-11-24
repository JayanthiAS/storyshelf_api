import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Book, BookSchema } from '../books/schemas/book.schema';
import {
  Subscription,
  SubscriptionSchema,
} from '../subscriptions/schemas/subscription.schema';
import {
  LoginActivity,
  LoginActivitySchema,
} from '../auth/schemas/login-activity.schema';
import {
  ReadingSession,
  ReadingSessionSchema,
} from '../reading-activity/schemas/reading-session.schema';
import {
  ReadingProgress,
  ReadingProgressSchema,
} from '../reading-activity/schemas/reading-progress.schema';
import {
  PaymentEvent,
  PaymentEventSchema,
} from '../subscriptions/schemas/payment-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Book.name, schema: BookSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: LoginActivity.name, schema: LoginActivitySchema },
      { name: ReadingSession.name, schema: ReadingSessionSchema },
      { name: ReadingProgress.name, schema: ReadingProgressSchema },
      { name: PaymentEvent.name, schema: PaymentEventSchema },
    ]),
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminModule {}
