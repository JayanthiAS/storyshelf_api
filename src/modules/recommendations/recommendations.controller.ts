import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { QueryDto } from '../authors/dto/author.dto';

@ApiTags('recommendations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(private recommendationsService: RecommendationsService) {}

  @Get()
  getRecommendations(
    @CurrentUser('sub') userId: string,
    @Query() query: QueryDto,
  ) {
    return this.recommendationsService.getRecommendations(userId, query);
  }

  @Get('by-genre/:genreId')
  getByGenre(
    @CurrentUser('sub') userId: string,
    @Param('genreId') genreId: string,
    @Query() query: QueryDto,
  ) {
    return this.recommendationsService.getByGenre(userId, genreId, query);
  }

  @Get('by-author/:authorId')
  getByAuthor(
    @CurrentUser('sub') userId: string,
    @Param('authorId') authorId: string,
    @Query() query: QueryDto,
  ) {
    return this.recommendationsService.getByAuthor(userId, authorId, query);
  }

  @Get('similar/:bookId')
  getSimilar(
    @CurrentUser('sub') userId: string,
    @Param('bookId') bookId: string,
    @Query() query: QueryDto,
  ) {
    return this.recommendationsService.getSimilar(userId, bookId, query);
  }
}
