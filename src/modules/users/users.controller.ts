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
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  UserQueryDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import {
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { SuperAdminOnly } from '../../common/decorators/super-admin.decorator';

@ApiTags('admin/users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get('deleted')
  findDeleted(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query, true);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @SuperAdminOnly()
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: JwtPayload) {
    return this.usersService.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.usersService.update(id, dto, actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.softDelete(id);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.usersService.restore(id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.usersService.activate(id, isActive);
  }

  @Get(':id/subscription')
  getSubscription(@Param('id') id: string) {
    return this.usersService.getUserSubscription(id);
  }
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser('sub') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Delete('me')
  deleteAccount(@CurrentUser('sub') userId: string) {
    return this.usersService.deleteOwnAccount(userId);
  }
}
