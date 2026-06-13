import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { BooksService } from './books.service';
import {
  CreateBookDto,
  UpdateBookDto,
  BookQueryDto,
  LockBookDto,
} from './dto/book.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import {
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('books')
@Controller('books')
export class BooksPublicController {
  constructor(private booksService: BooksService) {}

  @Public()
  @Get()
  findAll(@Query() query: BookQueryDto) {
    return this.booksService.findAll(query);
  }

  @Public()
  @Get('recently-added')
  recentlyAdded(@Query() query: BookQueryDto) {
    return this.booksService.findRecentlyAdded(query);
  }

  @Public()
  @Get('featured')
  featured(@Query() query: BookQueryDto) {
    return this.booksService.findFeatured(query);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.booksService.findById(id, user);
  }

  @Public()
  @Get(':id/preview')
  preview(@Param('id') id: string) {
    return this.booksService.getPreview(id);
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/content')
  getContent(@Param('id') id: string, @CurrentUser() user?: JwtPayload) {
    return this.booksService.getContent(id, user);
  }
}

@ApiTags('admin/books')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/books')
export class BooksAdminController {
  constructor(private booksService: BooksService) {}

  @Get()
  findAll(@Query() query: BookQueryDto) {
    return this.booksService.findAll(query, true);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.booksService.findById(id, user, true);
  }

  @Post()
  create(@Body() dto: CreateBookDto) {
    return this.booksService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBookDto) {
    return this.booksService.update(id, dto);
  }

  @Patch(':id/publish')
  publish(@Param('id') id: string) {
    return this.booksService.publish(id);
  }

  @Patch(':id/lock')
  toggleLock(@Param('id') id: string, @Body() dto: LockBookDto) {
    return this.booksService.toggleLock(id, dto.isLocked);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.booksService.softDelete(id);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.booksService.restore(id);
  }

  @Post(':id/upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.booksService.uploadFile(id, file);
  }

  @Post(':id/cover')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadCover(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.booksService.uploadCover(id, file);
  }

  @Delete(':id/file')
  removeFile(@Param('id') id: string) {
    return this.booksService.removeFile(id);
  }
}
