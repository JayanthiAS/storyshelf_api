import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService, QUEUES } from '../common/services/rabbitmq.service';
import { StripeWebhookEventPayload } from '../modules/subscriptions/stripe-event.types';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { RecommendationsService } from '../modules/recommendations/recommendations.service';
import { SubscriptionsService } from '../modules/subscriptions/subscriptions.service';

@Injectable()
export class WorkersService implements OnModuleInit {
  private readonly logger = new Logger(WorkersService.name);

  constructor(
    private rabbitMQService: RabbitMQService,
    private notificationsService: NotificationsService,
    private recommendationsService: RecommendationsService,
    private subscriptionsService: SubscriptionsService,
  ) {}

  async onModuleInit() {
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
      this.logger.log(`Processing Stripe event from queue: ${payload.type}`);
      await this.subscriptionsService.handleStripeEvent({
        id: payload.eventId as string,
        type: payload.type as string,
        data: { object: payload.data as Record<string, unknown> },
      } satisfies StripeWebhookEventPayload);
    });

    if (this.rabbitMQService.isConnected()) {
      this.logger.log('Background workers started (RabbitMQ)');
    } else {
      this.logger.log('Background workers started (in-process fallback)');
    }
  }
}
