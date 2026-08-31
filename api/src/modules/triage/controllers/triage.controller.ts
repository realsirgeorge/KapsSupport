import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TriageService } from '../services/triage.service';

@Controller('/v1/triage')
@UseGuards(JwtAuthGuard)
export class TriageController {
  constructor(private triageService: TriageService) {}

  /**
   * GET /v1/triage/queue - List tickets for triage
   * Returns: unconfirmed category OR unassigned tickets
   */
  @Get('queue')
  async getQueue(@Request() req) {
    const result = await this.triageService.getQueue(req.user);
    return {
      data: result.data,
      meta: {
        total: result.data.length,
      },
    };
  }
}

@Controller('/v1')
@UseGuards(JwtAuthGuard)
export class TriageTicketsController {
  constructor(private triageService: TriageService) {}

  /**
   * POST /v1/tickets/:id/category/confirm - Confirm/correct category
   */
  @Post('tickets/:id/category/confirm')
  async confirmCategory(
    @Param('id') id: string,
    @Body() body: { category_id: string },
    @Request() req,
  ) {
    if (!body.category_id) {
      throw new BadRequestException('Category ID is required');
    }

    const result = await this.triageService.confirmCategory(id, body.category_id, req.user);
    return {
      data: result.ticket,
      meta: {
        reassignment_required: result.reassignment_required,
      },
    };
  }

  /**
   * POST /v1/tickets/:id/priority/confirm - Confirm priority
   * Allowed by: Support/Triage or Manager (own team)
   */
  @Post('tickets/:id/priority/confirm')
  async confirmPriority(
    @Param('id') id: string,
    @Body() body: { priority: string },
    @Request() req,
  ) {
    if (!body.priority) {
      throw new BadRequestException('Priority is required');
    }

    const result = await this.triageService.confirmPriority(id, body.priority, req.user);
    return { data: result };
  }

  /**
   * POST /v1/tickets/:id/assign - Assign to team member
   * Validation: assignee in category's team, not unavailable
   */
  @Post('tickets/:id/assign')
  async assign(
    @Param('id') id: string,
    @Body() body: { assignee_id: string },
    @Request() req,
  ) {
    if (!body.assignee_id) {
      throw new BadRequestException('Assignee ID is required');
    }

    const result = await this.triageService.assign(id, body.assignee_id, req.user);
    return { data: result };
  }
}
