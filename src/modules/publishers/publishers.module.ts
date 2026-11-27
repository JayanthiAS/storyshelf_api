import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { BooksModule } from '../books/books.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Author, AuthorSchema } from '../authors/schemas/author.schema';
import { Genre, GenreSchema } from '../genres/schemas/genre.schema';
import { AdminPublishersController } from './admin-publishers.controller';
import { PublisherPortalController } from './publishers.controller';
import {
  AdminPublisherReviewsController,
  PublisherBooksController,
} from './publisher-books.controller';
import { PublisherBooksService } from './publisher-books.service';
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
    BooksModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: PublisherMembership.name, schema: PublisherMembershipSchema },
      { name: PublisherAgreement.name, schema: PublisherAgreementSchema },
      { name: PublisherInvite.name, schema: PublisherInviteSchema },
      { name: User.name, schema: UserSchema },
      { name: Author.name, schema: AuthorSchema },
      { name: Genre.name, schema: GenreSchema },
    ]),
  ],
  controllers: [
    AdminPublishersController,
    PublisherPortalController,
    PublisherBooksController,
    AdminPublisherReviewsController,
  ],
  providers: [PublishersService, PublisherBooksService],
  exports: [PublishersService],
})
export class PublishersModule {}
