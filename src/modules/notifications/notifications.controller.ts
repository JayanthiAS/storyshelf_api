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
import { NotificationsService } from './notifications.service';
import {
  CreateNotificationDto,
  BroadcastNotificationDto,
  QueryDto,
} from './dto/notification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(@CurrentUser('sub') userId: string, @Query() query: QueryDto) {
    return this.notificationsService.findAll(userId, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('sub') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Get(':id')
  findOne(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.notificationsService.findById(userId, id);
  }

  @Patch(':id/read')
  markRead(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.notificationsService.markRead(userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.notificationsService.softDelete(userId, id);
  }
}

@ApiTags('admin/notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/notifications')
export class NotificationsAdminController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(@Query() query: QueryDto) {
    return this.notificationsService.adminFindAll(query);
  }

  @Post()
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Post('broadcast')
  broadcast(@Body() dto: BroadcastNotificationDto) {
    return this.notificationsService.broadcast(dto);
  }
}
