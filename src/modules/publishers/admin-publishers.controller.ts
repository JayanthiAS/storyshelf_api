import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreatePublisherHouseDto,
  PublisherListQueryDto,
} from './dto/publisher.dto';
import { PublishersService } from './publishers.service';

@ApiTags('admin/publishers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/publishers')
export class AdminPublishersController {
  constructor(private publishersService: PublishersService) {}

  @Get()
  list(@Query() query: PublisherListQueryDto) {
    return this.publishersService.listHouses(query);
  }

  @Post()
  create(
    @Body() dto: CreatePublisherHouseDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.publishersService.createHouse(dto, adminId);
  }

  @Post(':id/invites/resend')
  resend(@Param('id', ParseObjectIdPipe) id: string) {
    return this.publishersService.resendInvite(id.toString());
  }

  @Post(':id/suspend')
  suspend(@Param('id', ParseObjectIdPipe) id: string) {
    return this.publishersService.suspendHouse(id.toString());
  }

  @Post(':id/reactivate')
  reactivate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.publishersService.reactivateHouse(id.toString());
  }
}
