import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService, QUEUES } from '../common/services/rabbitmq.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { RecommendationsService } from '../modules/recommendations/recommendations.service';

@Injectable()
export class WorkersService implements OnModuleInit {
  private readonly logger = new Logger(WorkersService.name);

  constructor(
    private rabbitMQService: RabbitMQService,
    private notificationsService: NotificationsService,
    private recommendationsService: RecommendationsService,
  ) {}

  async onModuleInit() {
    try {
      await this.rabbitMQService.consume(
        QUEUES.NOTIFICATIONS_SEND,
        async (payload) => {
          await this.notificationsService.createFromQueue(payload);
        },
      );

      await this.rabbitMQService.consume(
        QUEUES.RECOMMENDATIONS_COMPUTE,
        async (payload) => {
          await this.recommendationsService.processRecommendationEvent(payload);
        },
      );

      await this.rabbitMQService.consume(QUEUES.STRIPE_EVENTS, async (payload) => {
        this.logger.log(`Stripe event processed: ${payload.type}`);
      });

      this.logger.log('Background workers started');
    } catch (error) {
      this.logger.warn(
        `Workers not started: ${(error as Error).message}`,
      );
    }
  }
}
