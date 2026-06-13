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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthorsService } from './authors.service';
import { CreateAuthorDto, UpdateAuthorDto, QueryDto } from './dto/author.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('authors')
@Controller('authors')
export class AuthorsPublicController {
  constructor(private authorsService: AuthorsService) {}

  @Public()
  @Get()
  findAll(@Query() query: QueryDto) {
    return this.authorsService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authorsService.findById(id);
  }

  @Public()
  @Get(':id/books')
  getBooks(@Param('id') id: string, @Query() query: QueryDto) {
    return this.authorsService.getAuthorBooks(id, query);
  }
}

@ApiTags('admin/authors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/authors')
export class AuthorsAdminController {
  constructor(private authorsService: AuthorsService) {}

  @Post()
  create(@Body() dto: CreateAuthorDto) {
    return this.authorsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAuthorDto) {
    return this.authorsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.authorsService.softDelete(id);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.authorsService.restore(id);
  }
}
