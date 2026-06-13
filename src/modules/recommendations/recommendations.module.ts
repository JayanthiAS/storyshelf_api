import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { Book, BookSchema } from '../books/schemas/book.schema';
import { BookLike, BookLikeSchema } from '../reading-activity/schemas/book-like.schema';
import {
  ReadingSession,
  ReadingSessionSchema,
} from '../reading-activity/schemas/reading-session.schema';
import {
  ReadingProgress,
  ReadingProgressSchema,
} from '../reading-activity/schemas/reading-progress.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Book.name, schema: BookSchema },
      { name: BookLike.name, schema: BookLikeSchema },
      { name: ReadingSession.name, schema: ReadingSessionSchema },
      { name: ReadingProgress.name, schema: ReadingProgressSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
