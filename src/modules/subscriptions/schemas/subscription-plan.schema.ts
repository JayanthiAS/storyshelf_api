import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { PlanInterval } from '../../../common/enums/plan-interval.enum';

export type SubscriptionPlanDocument = SubscriptionPlan & Document;

@Schema({ timestamps: true })
export class SubscriptionPlan {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 0 })
  price: number;

  @Prop({ default: 'usd' })
  currency: string;

  @Prop({ type: String, enum: PlanInterval, default: PlanInterval.FREE })
  interval: PlanInterval;

  @Prop({ type: String, default: null })
  stripePriceId: string | null;

  @Prop({ type: String, default: null })
  stripeProductId: string | null;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  unlocksLockedBooks: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const SubscriptionPlanSchema =
  SchemaFactory.createForClass(SubscriptionPlan);
