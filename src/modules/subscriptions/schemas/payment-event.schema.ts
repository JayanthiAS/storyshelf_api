import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PaymentEventDocument = PaymentEvent & Document;

@Schema({ timestamps: true })
export class PaymentEvent {
  @Prop({ required: true, unique: true })
  stripeEventId: string;

  @Prop({ required: true })
  type: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ default: 'processed' })
  status: string;

  @Prop({ type: Date, default: Date.now })
  processedAt: Date;
}

export const PaymentEventSchema = SchemaFactory.createForClass(PaymentEvent);
