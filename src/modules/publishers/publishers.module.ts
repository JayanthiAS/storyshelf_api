import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AdminPublishersController } from './admin-publishers.controller';
import { PublisherPortalController } from './publishers.controller';
import { PublishersService } from './publishers.service';
import {
  Organization,
  OrganizationSchema,
} from './schemas/organization.schema';
import {
  PublisherAgreement,
  PublisherAgreementSchema,
} from './schemas/publisher-agreement.schema';
import {
  PublisherInvite,
  PublisherInviteSchema,
} from './schemas/publisher-invite.schema';
import {
  PublisherMembership,
  PublisherMembershipSchema,
} from './schemas/publisher-membership.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: PublisherMembership.name, schema: PublisherMembershipSchema },
      { name: PublisherAgreement.name, schema: PublisherAgreementSchema },
      { name: PublisherInvite.name, schema: PublisherInviteSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminPublishersController, PublisherPortalController],
  providers: [PublishersService],
  exports: [PublishersService],
})
export class PublishersModule {}
