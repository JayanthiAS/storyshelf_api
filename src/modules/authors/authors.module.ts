import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthorsService } from './authors.service';
import {
  AuthorsPublicController,
  AuthorsAdminController,
} from './authors.controller';
import { Author, AuthorSchema } from './schemas/author.schema';
import { Book, BookSchema } from '../books/schemas/book.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Author.name, schema: AuthorSchema },
      { name: Book.name, schema: BookSchema },
    ]),
  ],
  controllers: [AuthorsPublicController, AuthorsAdminController],
  providers: [AuthorsService],
  exports: [AuthorsService],
})
export class AuthorsModule {}
