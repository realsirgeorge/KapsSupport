import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DashboardService } from '../services/dashboard.service';

@Controller('/v1')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  /**
   * GET /v1/me/counters - Role-specific counter data
   */
  @Get('/me/counters')
  async getCounters(@Request() req) {
    const counters = await this.dashboardService.getCounters(req.user);
    return { data: counters };
  }
}

@Controller('/v1/dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardSystemController {
  constructor(private dashboardService: DashboardService) {}

  /**
   * GET /v1/dashboard/system - System-wide overview (Admin/Executive only)
   */
  @Get('/system')
  async getSystemDashboard(@Request() req) {
    const data = await this.dashboardService.getSystemDashboard(req.user);
    return { data };
  }

  /**
   * GET /v1/dashboard/system/pending-confirmations - Long-wait tickets (Admin/Executive only)
   */
  @Get('/system/pending-confirmations')
  async getPendingConfirmations(@Request() req) {
    const tickets = await this.dashboardService.getPendingConfirmations(req.user);
    return { data: tickets };
  }
}
