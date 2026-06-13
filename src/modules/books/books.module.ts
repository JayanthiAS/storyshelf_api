import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BooksService } from './books.service';
import {
  BooksPublicController,
  BooksAdminController,
} from './books.controller';
import { Book, BookSchema } from './schemas/book.schema';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Book.name, schema: BookSchema }]),
    forwardRef(() => SubscriptionsModule),
  ],
  controllers: [BooksPublicController, BooksAdminController],
  providers: [BooksService],
  exports: [BooksService, MongooseModule],
})
export class BooksModule {}
