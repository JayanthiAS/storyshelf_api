import { Module } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { RecommendationsModule } from '../modules/recommendations/recommendations.module';
import { SubscriptionsModule } from '../modules/subscriptions/subscriptions.module';

@Module({
  imports: [NotificationsModule, RecommendationsModule, SubscriptionsModule],
  providers: [WorkersService],
})
export class WorkersModule {}
