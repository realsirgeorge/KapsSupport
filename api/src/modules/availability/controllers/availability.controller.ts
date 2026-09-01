import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AvailabilityService } from '../services/availability.service';

@Controller('/v1/availability-requests')
@UseGuards(JwtAuthGuard)
export class AvailabilityController {
  constructor(private availabilityService: AvailabilityService) {}

  /**
   * POST /v1/availability-requests - Team Member requests leave
   *
   * Body: { type: "range"|"toggle", start_date?, end_date? }
   * - Range requires both dates; toggle has no dates (open-ended)
   * - Creates request with status='pending' (NOT immediately unavailable)
   */
  @Post()
  async requestLeave(
    @Body()
    body: {
      type: 'range' | 'toggle';
      start_date?: string;
      end_date?: string;
    },
    @Request() req,
  ) {
    if (!body.type) {
      throw new BadRequestException('Type is required');
    }

    const request = await this.availabilityService.requestLeave(req.user.id, body, req.user);
    return { data: request };
  }

  /**
   * GET /v1/availability-requests - Manager lists requests (own team), Admin lists all
   *
   * Params: ?status=pending for approval queue
   * Scoping: Manager (own team), Admin
   */
  @Get()
  async listRequests(
    @Request() req,
    @Query('status') status?: string,
  ) {
    const result = await this.availabilityService.listRequests(req.user, { status });
    return {
      data: result.data,
      meta: {
        total: result.total,
      },
    };
  }

  /**
   * POST /v1/availability-requests/:id/approve - Manager approves (own team only)
   *
   * Sets: status='approved' AND users.is_unavailable=true
   * Only code path allowed to write is_unavailable (other: worker leave-expiry job)
   */
  @Post(':id/approve')
  async approveRequest(
    @Param('id') id: string,
    @Request() req,
  ) {
    const request = await this.availabilityService.approveRequest(id, req.user);
    return { data: request };
  }

  /**
   * POST /v1/availability-requests/:id/reject - Manager rejects (own team only)
   *
   * Sets: status='rejected', does NOT touch is_unavailable
   */
  @Post(':id/reject')
  async rejectRequest(
    @Param('id') id: string,
    @Request() req,
  ) {
    const request = await this.availabilityService.rejectRequest(id, req.user);
    return { data: request };
  }

  /**
   * POST /v1/availability-requests/:id/end - Manager (own team) or requester ends/cancels
   *
   * Scoping: Manager (own team) OR the requesting user themselves
   * Sets: status='ended'
   * For toggle: also sets users.is_unavailable=false
   * For range: just status='ended', auto-return handled by worker
   */
  @Post(':id/end')
  async endRequest(
    @Param('id') id: string,
    @Request() req,
  ) {
    const request = await this.availabilityService.endRequest(id, req.user);
    return { data: request };
  }
}
