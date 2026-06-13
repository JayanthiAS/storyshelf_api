import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReadingActivityService } from './reading-activity.service';
import {
  UpdateProgressDto,
  CreateSessionDto,
  QueryDto,
} from './dto/reading.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('reading')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reading')
export class ReadingActivityController {
  constructor(private readingService: ReadingActivityService) {}

  @Get('progress')
  getAllProgress(@CurrentUser('sub') userId: string) {
    return this.readingService.getAllProgress(userId);
  }

  @Get('progress/:bookId')
  getProgress(
    @CurrentUser('sub') userId: string,
    @Param('bookId') bookId: string,
  ) {
    return this.readingService.getProgress(userId, bookId);
  }

  @Put('progress/:bookId')
  updateProgress(
    @CurrentUser('sub') userId: string,
    @Param('bookId') bookId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.readingService.updateProgress(userId, bookId, dto);
  }

  @Post('sessions')
  createSession(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.readingService.createSession(userId, dto);
  }

  @Get('history')
  getHistory(@CurrentUser('sub') userId: string, @Query() query: QueryDto) {
    return this.readingService.getHistory(userId, query);
  }
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/likes')
export class LikesController {
  constructor(private readingService: ReadingActivityService) {}

  @Get()
  getLikes(@CurrentUser('sub') userId: string, @Query() query: QueryDto) {
    return this.readingService.getLikes(userId, query);
  }

  @Post(':bookId')
  likeBook(
    @CurrentUser('sub') userId: string,
    @Param('bookId') bookId: string,
  ) {
    return this.readingService.likeBook(userId, bookId);
  }

  @Delete(':bookId')
  unlikeBook(
    @CurrentUser('sub') userId: string,
    @Param('bookId') bookId: string,
  ) {
    return this.readingService.unlikeBook(userId, bookId);
  }
}
