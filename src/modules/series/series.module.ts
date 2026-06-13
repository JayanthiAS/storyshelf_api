import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeriesService } from './series.service';
import {
  SeriesPublicController,
  SeriesAdminController,
} from './series.controller';
import { Series, SeriesSchema } from './schemas/series.schema';
import { Book, BookSchema } from '../books/schemas/book.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Series.name, schema: SeriesSchema },
      { name: Book.name, schema: BookSchema },
    ]),
  ],
  controllers: [SeriesPublicController, SeriesAdminController],
  providers: [SeriesService],
  exports: [SeriesService],
})
export class SeriesModule {}
