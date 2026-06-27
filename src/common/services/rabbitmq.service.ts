import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

export const QUEUES = {
  NOTIFICATIONS_SEND: 'notifications.send',
  RECOMMENDATIONS_COMPUTE: 'recommendations.compute',
  STRIPE_EVENTS: 'stripe.events',
} as const;

type AmqpConnection = Awaited<ReturnType<typeof amqplib.connect>>;
type MessageHandler = (msg: Record<string, unknown>) => Promise<void>;

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: AmqpConnection | null = null;
  private channel: amqplib.Channel | null = null;
  private readonly localHandlers = new Map<string, MessageHandler[]>();
  private usingLocalFallback = false;
  private connectionGeneration = 0;
  private attachedGeneration = -1;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.tryConnect();
  }

  private async tryConnect(): Promise<boolean> {
    try {
      await this.connect();
      this.usingLocalFallback = false;
      this.logger.log('RabbitMQ connection established');
      await this.attachRabbitConsumers();
      return true;
    } catch (error) {
      this.usingLocalFallback = true;
      this.logger.warn(
        `RabbitMQ unavailable — using in-process queue handlers: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async connect(): Promise<void> {
    const url = this.configService.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );
    this.connection = await amqplib.connect(url);
    this.channel = await this.connection.createChannel();
    this.connectionGeneration++;

    for (const queue of Object.values(QUEUES)) {
      await this.channel.assertQueue(queue, { durable: true });
    }

    this.logger.log('RabbitMQ connected');
  }

  async consume(
    queue: string,
    handler: MessageHandler,
  ): Promise<void> {
    const handlers = this.localHandlers.get(queue) ?? [];
    handlers.push(handler);
    this.localHandlers.set(queue, handlers);

    if (this.channel) {
      await this.attachRabbitConsumers();
    }
  }

  private async attachRabbitConsumers(): Promise<void> {
    if (!this.channel || this.attachedGeneration === this.connectionGeneration) {
      return;
    }

    for (const [queue, handlers] of this.localHandlers.entries()) {
      for (const handler of handlers) {
        await this.attachRabbitConsumer(queue, handler);
      }
    }

    this.attachedGeneration = this.connectionGeneration;
  }

  private async attachRabbitConsumer(
    queue: string,
    handler: MessageHandler,
  ): Promise<void> {
    if (!this.channel) return;

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const content = JSON.parse(msg.content.toString()) as Record<string, unknown>;
        await handler(content);
        this.channel!.ack(msg);
      } catch (error) {
        this.logger.error(`Error processing message: ${(error as Error).message}`);
        this.channel!.nack(msg, false, false);
      }
    });
  }

  async publish(queue: string, message: Record<string, unknown>): Promise<void> {
    if (!this.channel) {
      const connected = await this.tryConnect();
      if (!connected) {
        await this.publishLocally(queue, message);
        return;
      }
    }

    try {
      this.channel!.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
        persistent: true,
      });
    } catch (error) {
      this.channel = null;
      this.connection = null;
      this.attachedGeneration = -1;
      this.usingLocalFallback = true;
      this.logger.warn(
        `Failed to publish to ${queue}: ${(error as Error).message}`,
      );
      await this.publishLocally(queue, message);
    }
  }

  private async publishLocally(
    queue: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    const handlers = this.localHandlers.get(queue) ?? [];
    if (handlers.length === 0) {
      this.logger.warn(
        `Failed to publish to ${queue}: RabbitMQ unavailable and no local handlers registered`,
      );
      return;
    }

    for (const handler of handlers) {
      try {
        await handler(message);
      } catch (error) {
        this.logger.error(
          `In-process handler failed for ${queue}: ${(error as Error).message}`,
        );
      }
    }
  }

  isConnected(): boolean {
    return this.channel !== null;
  }

  isUsingLocalFallback(): boolean {
    return this.usingLocalFallback;
  }

  async onModuleDestroy() {
    await this.channel?.close();
    const conn = this.connection as { close?: () => Promise<void> } | null;
    if (conn?.close) {
      await conn.close();
    }
  }
}
