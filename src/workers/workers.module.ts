import { Module } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { RecommendationsModule } from '../modules/recommendations/recommendations.module';

@Module({
  imports: [NotificationsModule, RecommendationsModule],
  providers: [WorkersService],
})
export class WorkersModule {}
