import {
  Controller,
  Get,
  Patch,
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
  UpdateSessionDto,
  QueryDto,
} from './dto/reading.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('reading')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reading')
export class ReadingActivityController {
  constructor(private readingService: ReadingActivityService) {}

  @Get('progress')
  getAllProgress(@CurrentUser() user: JwtPayload) {
    if (user.role === Role.GUEST) return [];
    return this.readingService.getAllProgress(user.sub);
  }

  @Get('progress/:bookId')
  getProgress(
    @CurrentUser() user: JwtPayload,
    @Param('bookId') bookId: string,
  ) {
    if (user.role === Role.GUEST) return null;
    return this.readingService.getProgress(user.sub, bookId);
  }

  @Put('progress/:bookId')
  updateProgress(
    @CurrentUser() user: JwtPayload,
    @Param('bookId') bookId: string,
    @Body() dto: UpdateProgressDto,
  ) {
    if (user.role === Role.GUEST) return { ...dto, stored: false };
    return this.readingService.updateProgress(user.sub, bookId, dto);
  }

  @Post('sessions')
  createSession(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSessionDto,
  ) {
    if (user.role === Role.GUEST) return { stored: false };
    return this.readingService.createSession(user.sub, dto);
  }

  @Patch('sessions/:id')
  updateSession(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    if (user.role === Role.GUEST) return { stored: false };
    return this.readingService.updateSession(user.sub, id, dto);
  }

  @Get('history')
  getHistory(@CurrentUser() user: JwtPayload, @Query() query: QueryDto) {
    if (user.role === Role.GUEST) {
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } };
    }
    return this.readingService.getHistory(user.sub, query);
  }
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/likes')
export class LikesController {
  constructor(private readingService: ReadingActivityService) {}

  @Get()
  getLikes(@CurrentUser() user: JwtPayload, @Query() query: QueryDto) {
    if (user.role === Role.GUEST) {
      return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } };
    }
    return this.readingService.getLikes(user.sub, query);
  }

  @Post(':bookId')
  likeBook(
    @CurrentUser() user: JwtPayload,
    @Param('bookId') bookId: string,
  ) {
    if (user.role === Role.GUEST) return { stored: false };
    return this.readingService.likeBook(user.sub, bookId);
  }

  @Delete(':bookId')
  unlikeBook(
    @CurrentUser() user: JwtPayload,
    @Param('bookId') bookId: string,
  ) {
    if (user.role === Role.GUEST) return { stored: false };
    return this.readingService.unlikeBook(user.sub, bookId);
  }
}
