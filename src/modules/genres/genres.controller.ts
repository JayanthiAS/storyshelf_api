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
import { GenresService } from './genres.service';
import { CreateGenreDto, UpdateGenreDto, QueryDto } from './dto/genre.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('genres')
@Controller('genres')
export class GenresPublicController {
  constructor(private genresService: GenresService) {}

  @Public()
  @Get()
  findAll(@Query() query: QueryDto) {
    return this.genresService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.genresService.findById(id);
  }

  @Public()
  @Get(':id/books')
  getBooks(@Param('id') id: string, @Query() query: QueryDto) {
    return this.genresService.getGenreBooks(id, query);
  }
}

@ApiTags('admin/genres')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/genres')
export class GenresAdminController {
  constructor(private genresService: GenresService) {}

  @Post()
  create(@Body() dto: CreateGenreDto) {
    return this.genresService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGenreDto) {
    return this.genresService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.genresService.softDelete(id);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.genresService.restore(id);
  }
}
