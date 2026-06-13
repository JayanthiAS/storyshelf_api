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
import { SeriesService } from './series.service';
import { CreateSeriesDto, UpdateSeriesDto, QueryDto } from './dto/series.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('series')
@Controller('series')
export class SeriesPublicController {
  constructor(private seriesService: SeriesService) {}

  @Public()
  @Get()
  findAll(@Query() query: QueryDto) {
    return this.seriesService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.seriesService.findById(id);
  }

  @Public()
  @Get(':id/books')
  getBooks(@Param('id') id: string, @Query() query: QueryDto) {
    return this.seriesService.getSeriesBooks(id, query);
  }
}

@ApiTags('admin/series')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/series')
export class SeriesAdminController {
  constructor(private seriesService: SeriesService) {}

  @Post()
  create(@Body() dto: CreateSeriesDto) {
    return this.seriesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSeriesDto) {
    return this.seriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.seriesService.softDelete(id);
  }
}
