import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { BooksModule } from '../books/books.module';

@Module({
  imports: [BooksModule],
  controllers: [SearchController],
})
export class SearchModule {}
