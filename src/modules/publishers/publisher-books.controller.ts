import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreatePublisherAuthorDto,
  CreatePublisherBookDto,
  ReviewNoteDto,
  UpdatePublisherBookDto,
} from './dto/publisher-book.dto';
import { PublisherBooksService } from './publisher-books.service';

@ApiTags('publisher/books')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PUBLISHER)
@Controller('publisher')
export class PublisherBooksController {
  constructor(private books: PublisherBooksService) {}

  @Get('authors')
  authors(@CurrentUser('sub') userId: string) {
    return this.books.listAuthors(userId);
  }

  @Post('authors')
  createAuthor(
    @CurrentUser('sub') userId: string,
    @Body() body: CreatePublisherAuthorDto,
  ) {
    return this.books.createAuthor(userId, body.name, body.bio);
  }

  @Get('books')
  list(@CurrentUser('sub') userId: string) {
    return this.books.listForHouse(userId);
  }

  @Post('books')
  create(@CurrentUser('sub') userId: string, @Body() dto: CreatePublisherBookDto) {
    return this.books.create(userId, dto);
  }

  @Get('books/:id/preview-file')
  previewFile(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.books.previewFile(userId, id);
  }

  @Get('books/:id')
  getOne(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.books.getForHouse(userId, id);
  }

  @Patch('books/:id')
  update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePublisherBookDto,
  ) {
    return this.books.update(userId, id, dto);
  }

  @Post('books/:id/file')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Book file is required.');
    return this.books.uploadFile(userId, id, file);
  }

  @Post('books/:id/cover')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'cover', maxCount: 1 },
    ]),
  )
  uploadCover(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @UploadedFiles()
    files: { file?: Express.Multer.File[]; cover?: Express.Multer.File[] },
  ) {
    const file = files?.file?.[0] ?? files?.cover?.[0];
    if (!file) throw new BadRequestException('Cover image is required.');
    return this.books.uploadCover(userId, id, file);
  }

  @Post('books/:id/submit')
  submit(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.books.submit(userId, id);
  }

  @Post('books/:id/withdraw')
  withdraw(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.books.withdraw(userId, id);
  }

  @Post('books/:id/takedown-request')
  takedown(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.books.requestTakedown(userId, id);
  }
}

@ApiTags('admin/publisher-reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/publisher-reviews')
export class AdminPublisherReviewsController {
  constructor(private books: PublisherBooksService) {}

  @Get()
  list() {
    return this.books.listReviews();
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser('sub') reviewerId: string) {
    return this.books.approve(id, reviewerId);
  }

  @Post(':id/changes')
  changes(
    @Param('id') id: string,
    @CurrentUser('sub') reviewerId: string,
    @Body() body: ReviewNoteDto,
  ) {
    return this.books.requestChanges(id, reviewerId, body.note.trim());
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser('sub') reviewerId: string,
    @Body() body: ReviewNoteDto,
  ) {
    return this.books.reject(id, reviewerId, body.note.trim());
  }

  @Post(':id/takedown')
  takedown(@Param('id') id: string, @CurrentUser('sub') reviewerId: string) {
    return this.books.confirmTakedown(id, reviewerId);
  }
}
