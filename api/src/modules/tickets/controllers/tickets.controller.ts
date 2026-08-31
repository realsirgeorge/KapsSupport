import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TicketService } from '../services/ticket.service';
import { TicketStatus } from '../states/ticket-state-machine';

@Controller('/v1/tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(private ticketService: TicketService) {}

  /**
   * GET /v1/tickets - List tickets (role-scoped)
   */
  @Get()
  async listTickets(
    @Request() req,
    @Query('status') status?: string,
    @Query('mine') mine?: boolean,
    @Query('assigned_to_me') assigned_to_me?: boolean,
    @Query('team_id') team_id?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.ticketService.listTickets(req.user, {
      status,
      mine: mine === 'true' || mine === true,
      assigned_to_me: assigned_to_me === 'true' || assigned_to_me === true,
      team_id,
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

  /**
   * GET /v1/tickets/:id - Get single ticket
   */
  @Get(':id')
  async getTicket(@Param('id') id: string, @Request() req) {
    const ticket = await this.ticketService.getTicket(id, req.user);
    return { data: ticket };
  }

  /**
   * POST /v1/tickets - Create ticket
   */
  @Post()
  async createTicket(
    @Body() body: {
      subject: string;
      description: string;
      site_id: string;
      suggested_category_id?: string;
      suggested_priority?: string;
    },
    @Request() req,
  ) {
    if (!body.subject || !body.description || !body.site_id) {
      throw new BadRequestException('Missing required fields');
    }

    const ticket = await this.ticketService.createTicket(body, req.user.id);
    return { data: ticket };
  }

  /**
   * PATCH /v1/tickets/:id/status - Update ticket status
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; pending_reason?: string },
    @Request() req,
  ) {
    if (!body.status) {
      throw new BadRequestException('Status is required');
    }

    const ticket = await this.ticketService.updateStatus(
      id,
      body.status as TicketStatus,
      req.user,
      body.pending_reason,
    );

    return { data: ticket };
  }

  /**
   * POST /v1/tickets/:id/confirm-resolution - Confirm or dispute resolution
   */
  @Post(':id/confirm-resolution')
  async confirmResolution(
    @Param('id') id: string,
    @Body() body: { action: 'confirm' | 'dispute'; comment?: string },
    @Request() req,
  ) {
    if (!body.action) {
      throw new BadRequestException('Action is required');
    }

    const ticket = await this.ticketService.confirmResolution(id, body.action, req.user, body.comment);
    return { data: ticket };
  }

  /**
   * POST /v1/tickets/:id/category/confirm - Confirm category
   */
  @Post(':id/category/confirm')
  async confirmCategory(
    @Param('id') id: string,
    @Body() body: { category_id: string },
    @Request() req,
  ) {
    if (!body.category_id) {
      throw new BadRequestException('Category ID is required');
    }

    const result = await this.ticketService.confirmCategory(id, body.category_id, req.user);
    return { data: result.ticket, meta: { reassignment_required: result.reassignment_required } };
  }

  /**
   * POST /v1/tickets/:id/assign - Assign ticket to team member
   */
  @Post(':id/assign')
  async assign(
    @Param('id') id: string,
    @Body() body: { assignee_id: string },
    @Request() req,
  ) {
    if (!body.assignee_id) {
      throw new BadRequestException('Assignee ID is required');
    }

    const ticket = await this.ticketService.assign(id, body.assignee_id, req.user);
    return { data: ticket };
  }
}
