import { Controller, Get, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminDashboardService } from './admin-dashboard.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@ApiTags('admin/dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private dashboardService: AdminDashboardService) { }

  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }

  @Get('analytics/export')
  async exportAnalytics(@Query() query: AnalyticsQueryDto): Promise<StreamableFile> {
    const granularity = query.granularity ?? 'month';
    const csv = await this.dashboardService.exportAnalytics(granularity);
    return new StreamableFile(Buffer.from(csv), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="storyshelf-analytics-${granularity}-${new Date().toISOString()}.csv"`,
    });
  }

  @Get('analytics')
  getAnalytics(@Query() query: AnalyticsQueryDto) {
    return this.dashboardService.getAnalytics(query.granularity ?? 'month');
  }

  @Get('recent-activity')
  getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }
}
