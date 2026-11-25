import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OrgRole } from '../../../common/enums/org-role.enum';
import { InviteStatus } from '../../../common/enums/invite-status.enum';

export type PublisherInviteDocument = PublisherInvite & Document;

@Schema({ timestamps: true })
export class PublisherInvite {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ type: String, enum: OrgRole, required: true })
  orgRole: OrgRole;

  @Prop({ required: true, unique: true, select: false })
  tokenHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: String, enum: InviteStatus, default: InviteStatus.PENDING })
  status: InviteStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  invitedBy: Types.ObjectId;

  @Prop({ type: Date, default: null })
  acceptedAt: Date | null;
}

export const PublisherInviteSchema = SchemaFactory.createForClass(PublisherInvite);
PublisherInviteSchema.index({ organizationId: 1, status: 1 });
PublisherInviteSchema.index({ email: 1, status: 1 });
