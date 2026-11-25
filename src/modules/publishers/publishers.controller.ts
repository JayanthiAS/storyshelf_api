import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UpdatePublisherOrganizationDto } from './dto/publisher.dto';
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
}
