import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { SubscriptionStatus } from '../../../common/enums/subscription-status.enum';

export type SubscriptionDocument = Subscription & Document;

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'SubscriptionPlan', required: true })
  planId: Types.ObjectId;

  @Prop({
    type: String,
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Prop({ type: String, default: null })
  stripeSubscriptionId: string | null;

  @Prop({ required: true })
  currentPeriodStart: Date;

  @Prop({ type: Date, default: null })
  currentPeriodEnd: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt: Date | null;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
SubscriptionSchema.index({ userId: 1 });
