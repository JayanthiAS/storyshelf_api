import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../../common/enums/role.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ type: String, enum: Role, default: Role.USER })
  role: Role;

  @Prop({ default: false })
  isSuperAdmin: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'Subscription', default: null })
  subscriptionId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'SubscriptionPlan', default: null })
  subscriptionPlanId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  stripeCustomerId: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ deletedAt: 1 });
