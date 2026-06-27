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
import { SubscriptionsService } from './subscriptions.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CheckoutDto,
  CheckoutSuccessQueryDto,
  QueryDto,
} from './dto/subscription.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('subscription-plans')
@Controller('subscription-plans')
export class PlansPublicController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Public()
  @Get()
  findAll() {
    return this.subscriptionsService.findAllPlans();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subscriptionsService.findPlanById(id);
  }
}

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get('me')
  getMySubscription(@CurrentUser('sub') userId: string) {
    return this.subscriptionsService.getMySubscription(userId);
  }

  @Post('checkout')
  checkout(@CurrentUser('sub') userId: string, @Body() dto: CheckoutDto) {
    return this.subscriptionsService.createCheckout(userId, dto);
  }

  @Post('portal')
  portal(@CurrentUser('sub') userId: string) {
    return this.subscriptionsService.createPortal(userId);
  }

  @Post('cancel')
  cancel(@CurrentUser('sub') userId: string) {
    return this.subscriptionsService.cancelSubscription(userId);
  }

  @Post('upgrade')
  upgrade(@CurrentUser('sub') userId: string, @Body() dto: CheckoutDto) {
    return this.subscriptionsService.createCheckout(userId, dto);
  }

  @Public()
  @Get('success')
  checkoutSuccess(@Query() query: CheckoutSuccessQueryDto) {
    return this.subscriptionsService.confirmCheckoutSuccess(query.session_id);
  }

  @Get('checkout/success')
  checkoutSuccessAuthenticated(
    @CurrentUser('sub') userId: string,
    @Query() query: CheckoutSuccessQueryDto,
  ) {
    return this.subscriptionsService.confirmCheckoutSuccess(
      query.session_id,
      userId,
    );
  }

  @Public()
  @Get('cancel')
  checkoutCancel() {
    return this.subscriptionsService.handleCheckoutCancel();
  }

  @Get('checkout/cancel')
  checkoutCancelAuthenticated(@CurrentUser('sub') userId: string) {
    return this.subscriptionsService.handleCheckoutCancel(userId);
  }
}

@ApiTags('admin/subscription-plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/subscription-plans')
export class PlansAdminController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get()
  findAll() {
    return this.subscriptionsService.findAllPlans(false);
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.subscriptionsService.createPlan(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.subscriptionsService.updatePlan(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.subscriptionsService.deletePlan(id);
  }
}

@ApiTags('admin/subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/subscriptions')
export class SubscriptionsAdminController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get()
  findAll(@Query() query: QueryDto) {
    return this.subscriptionsService.findAllSubscriptions(query);
  }

  @Get(':userId')
  getUserHistory(@Param('userId') userId: string) {
    return this.subscriptionsService.getUserSubscriptionHistory(userId);
  }
}
