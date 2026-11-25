import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PublisherAgreementDocument = PublisherAgreement & Document;

@Schema({ timestamps: true })
export class PublisherAgreement {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true })
  termsVersion: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  acceptedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  acceptedAt: Date | null;

  @Prop({ type: String, default: 'complimentary' })
  commercialModel: 'complimentary';

  @Prop({ type: Number, default: null })
  revenueShareBps: number | null;

  @Prop({ type: String, default: null })
  currency: string | null;

  @Prop({ type: [String], default: ['WORLD'] })
  territory: string[];
}

export const PublisherAgreementSchema =
  SchemaFactory.createForClass(PublisherAgreement);
PublisherAgreementSchema.index({ organizationId: 1, termsVersion: 1 }, { unique: true });
