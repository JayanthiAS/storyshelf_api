import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BooksService } from '../books/books.service';
import { BookQueryDto } from '../books/dto/book.dto';
import { Public } from '../../common/decorators/public.decorator';
import { RedisService } from '../../common/services/redis.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private booksService: BooksService,
    private redisService: RedisService,
  ) {}

  @Public()
  @Get('books')
  searchBooks(@Query('q') q: string, @Query() query: BookQueryDto) {
    return this.booksService.searchBooks(q, query);
  }

  @Public()
  @Get('suggest')
  async suggest(@Query('q') q: string) {
    if (!q || q.length < 2) return { data: [] };
    const cacheKey = `search:suggest:${q.toLowerCase()}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return { data: JSON.parse(cached) };

    const result = await this.booksService.searchBooks(q, { limit: 5 });
    const suggestions = result.data.map((b) => ({
      id: b._id.toString(),
      title: b.title,
    }));
    await this.redisService.set(cacheKey, JSON.stringify(suggestions), 300);
    return { data: suggestions };
  }
}
