import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

export const QUEUES = {
  NOTIFICATIONS_SEND: 'notifications.send',
  RECOMMENDATIONS_COMPUTE: 'recommendations.compute',
  STRIPE_EVENTS: 'stripe.events',
} as const;

type AmqpConnection = Awaited<ReturnType<typeof amqplib.connect>>;

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: AmqpConnection | null = null;
  private channel: amqplib.Channel | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      await this.connect();
      this.logger.log('RabbitMQ connection established');
    } catch (error) {
      this.logger.warn(
        `RabbitMQ connection failed (will retry on publish): ${(error as Error).message}`,
      );
    }
  }

  async connect(): Promise<void> {
    const url = this.configService.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );
    this.connection = await amqplib.connect(url);
    this.channel = await this.connection.createChannel();

    for (const queue of Object.values(QUEUES)) {
      await this.channel.assertQueue(queue, { durable: true });
    }

    this.logger.log('RabbitMQ connected');
  }

  async publish(queue: string, message: Record<string, unknown>): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }
    this.channel!.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
  }

  async consume(
    queue: string,
    handler: (msg: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }
    await this.channel!.consume(queue, async (msg) => {
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

  isConnected(): boolean {
    return this.channel !== null;
  }

  async onModuleDestroy() {
    await this.channel?.close();
    const conn = this.connection as { close?: () => Promise<void> } | null;
    if (conn?.close) {
      await conn.close();
    }
  }
}
