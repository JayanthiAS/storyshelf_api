import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OtpType } from '../../../common/enums/otp-type.enum';

export type OtpVerificationDocument = OtpVerification & Document;

@Schema({ timestamps: true })
export class OtpVerification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  code: string;

  @Prop({ type: String, enum: OtpType, required: true })
  type: OtpType;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  isUsed: boolean;
}

export const OtpVerificationSchema =
  SchemaFactory.createForClass(OtpVerification);
