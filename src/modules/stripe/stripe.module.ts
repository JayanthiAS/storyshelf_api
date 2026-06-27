import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeModule as GoLevelUpStripeModule } from '@golevelup/nestjs-stripe';
import { Public } from '../../common/decorators/public.decorator';
import { StripeService } from './stripe.service';

@Global()
@Module({
  imports: [
    GoLevelUpStripeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET', '');
        return {
          apiKey: config.get<string>('STRIPE_SECRET_KEY', 'sk_test_placeholder'),
          apiVersion: '2026-05-27.dahlia' as const,
          webhookConfig: {
            stripeSecrets: {
              account: webhookSecret,
              accountTest: webhookSecret,
            },
            controllerPrefix: 'subscriptions',
            requestBodyProperty: 'rawBody',
            decorators: [Public()],
            loggingConfiguration: {
              logMatchingEventHandlers: true,
            },
          },
        };
      },
    }),
  ],
  providers: [StripeService],
  exports: [StripeService, GoLevelUpStripeModule],
})
export class StripeModule {}
