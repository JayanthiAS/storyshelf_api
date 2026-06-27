import { StripeWebhookHandler } from '@golevelup/nestjs-stripe';
import { Injectable } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class SubscriptionWebhookService {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @StripeWebhookHandler('*')
  async handleEvent(event: { id: string; type: string; data: { object: unknown } }): Promise<void> {
    await this.subscriptionsService.handleStripeEvent(event);
  }
}
