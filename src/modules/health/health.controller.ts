import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator';
import { RedisService } from '../../common/services/redis.service';
import { RabbitMQService } from '../../common/services/rabbitmq.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    private redisService: RedisService,
    private rabbitMQService: RabbitMQService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb'),
    ]);
  }

  @Public()
  @Get('ready')
  async ready() {
    const checks: Record<string, string> = { mongodb: 'ok' };

    try {
      await this.redisService.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'down';
    }

    checks.rabbitmq = this.rabbitMQService.isConnected() ? 'ok' : 'down';

    const allOk = Object.values(checks).every((v) => v === 'ok');
    return {
      status: allOk ? 'ready' : 'degraded',
      checks,
    };
  }
}
