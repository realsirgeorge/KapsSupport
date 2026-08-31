import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ManagerService, Ticket, TeamMember } from '../services/manager.service';

/**
 * /v1/teams/:id/* endpoints
 */
@Controller('/v1/teams')
@UseGuards(JwtAuthGuard)
export class ManagerTeamsController {
  constructor(private managerService: ManagerService) {}

  /**
   * GET /v1/teams/:id/workload - Per-member open ticket count
   */
  @Get(':id/workload')
  async getWorkload(@Param('id') id: string, @Request() req: any) {
    const result = await this.managerService.getTeamWorkload(id, req.user);
    return result;
  }

  /**
   * GET /v1/teams/:id/stats - Team performance metrics
   */
  @Get(':id/stats')
  async getStats(@Param('id') id: string, @Request() req: any) {
    const result = await this.managerService.getTeamStats(id, req.user);
    return result;
  }

  /**
   * GET /v1/teams/:id/tickets - All team tickets
   */
  @Get(':id/tickets')
  async getTickets(
    @Request() req: any,
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('assigned_to') assigned_to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.managerService.getTeamTickets(id, req.user, {
      status,
      assigned_to,
      page,
      limit,
    });
    return {
      data: result.data,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }
}

/**
 * /v1/tickets/:id/* endpoints (manager-specific)
 */
@Controller('/v1/tickets')
@UseGuards(JwtAuthGuard)
export class ManagerTicketsController {
  constructor(private managerService: ManagerService) {}

  /**
   * POST /v1/tickets/:id/reassign - Manager reassigns within team
   */
  @Post(':id/reassign')
  async reassign(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { assignee_id: string },
  ) {
    if (!body.assignee_id) {
      throw new BadRequestException('Assignee ID is required');
    }

    const result = await this.managerService.reassign(id, body.assignee_id, req.user);
    return { data: result };
  }

  /**
   * POST /v1/tickets/:id/return-to-triage - Manager flags ticket back to Support/Triage
   */
  @Post(':id/return-to-triage')
  async returnToTriage(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const result = await this.managerService.returnToTriage(id, req.user, body?.reason);
    return { data: result };
  }
}
