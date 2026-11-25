import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OrgRole } from '../../../common/enums/org-role.enum';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';

export type PublisherMembershipDocument = PublisherMembership & Document;

@Schema({ timestamps: true })
export class PublisherMembership {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: String, enum: OrgRole, required: true })
  orgRole: OrgRole;

  @Prop({
    type: String,
    enum: MembershipStatus,
    default: MembershipStatus.ACTIVE,
  })
  status: MembershipStatus;
}

export const PublisherMembershipSchema =
  SchemaFactory.createForClass(PublisherMembership);
PublisherMembershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
PublisherMembershipSchema.index({ userId: 1, status: 1 });
