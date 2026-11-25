import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { OrganizationStatus } from '../../../common/enums/organization-status.enum';

export type OrganizationDocument = Organization & Document;

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true, trim: true })
  legalName: string;

  @Prop({ required: true, trim: true })
  displayName: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true, trim: true })
  country: string;

  @Prop({ type: String, default: null })
  website: string | null;

  @Prop({ type: String, default: null })
  logoUrl: string | null;

  @Prop({
    type: String,
    enum: OrganizationStatus,
    default: OrganizationStatus.INVITED,
  })
  status: OrganizationStatus;

  @Prop({ required: true, lowercase: true, trim: true })
  primaryContactEmail: string;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
OrganizationSchema.index({ status: 1, deletedAt: 1 });
