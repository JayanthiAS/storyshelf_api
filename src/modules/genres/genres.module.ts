import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GenresService } from './genres.service';
import {
  GenresPublicController,
  GenresAdminController,
} from './genres.controller';
import { Genre, GenreSchema } from './schemas/genre.schema';
import { Book, BookSchema } from '../books/schemas/book.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Genre.name, schema: GenreSchema },
      { name: Book.name, schema: BookSchema },
    ]),
  ],
  controllers: [GenresPublicController, GenresAdminController],
  providers: [GenresService],
  exports: [GenresService],
})
export class GenresModule {}
