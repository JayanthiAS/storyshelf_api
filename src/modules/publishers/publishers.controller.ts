import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  InviteStaffDto,
  UpdatePublisherOrganizationDto,
  UpdateStaffRoleDto,
} from './dto/publisher.dto';
import { PublishersService } from './publishers.service';

@ApiTags('publisher')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PUBLISHER)
@Controller('publisher')
export class PublisherPortalController {
  constructor(private publishersService: PublishersService) {}

  @Get('me')
  getMe(@CurrentUser('sub') userId: string) {
    return this.publishersService.getSession(userId);
  }

  @Patch('organization')
  updateOrganization(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdatePublisherOrganizationDto,
  ) {
    return this.publishersService.updateOrganization(userId, dto);
  }

  @Get('staff')
  listStaff(@CurrentUser('sub') userId: string) {
    return this.publishersService.listStaff(userId);
  }

  @Post('staff')
  inviteStaff(@CurrentUser('sub') userId: string, @Body() dto: InviteStaffDto) {
    return this.publishersService.inviteStaff(userId, dto);
  }

  @Patch('staff/:id')
  updateStaffRole(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffRoleDto,
  ) {
    return this.publishersService.updateStaffRole(userId, id, dto);
  }

  @Delete('staff/:id')
  removeStaff(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.publishersService.removeStaff(userId, id);
  }

  @Post('staff/invites/:id/resend')
  resendStaffInvite(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.publishersService.resendStaffInvite(userId, id);
  }

  @Delete('staff/invites/:id')
  revokeStaffInvite(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.publishersService.revokeStaffInvite(userId, id);
  }
}
