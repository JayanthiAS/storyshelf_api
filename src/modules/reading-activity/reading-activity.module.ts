import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReadingActivityService } from './reading-activity.service';
import {
  ReadingActivityController,
  LikesController,
} from './reading-activity.controller';
import { BookLike, BookLikeSchema } from './schemas/book-like.schema';
import {
  ReadingProgress,
  ReadingProgressSchema,
} from './schemas/reading-progress.schema';
import {
  ReadingSession,
  ReadingSessionSchema,
} from './schemas/reading-session.schema';
import { Book, BookSchema } from '../books/schemas/book.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BookLike.name, schema: BookLikeSchema },
      { name: ReadingProgress.name, schema: ReadingProgressSchema },
      { name: ReadingSession.name, schema: ReadingSessionSchema },
      { name: Book.name, schema: BookSchema },
    ]),
  ],
  controllers: [ReadingActivityController, LikesController],
  providers: [ReadingActivityService],
  exports: [ReadingActivityService, MongooseModule],
})
export class ReadingActivityModule {}
