import { Controller, Get, Post, Body, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CommentsService } from '../services/comments.service';

@Controller('/v1/tickets/:ticketId/comments')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get()
  async list(@Param('ticketId') ticketId: string, @Request() req) {
    const data = await this.commentsService.listForTicket(ticketId, req.user);
    return { data };
  }

  @Post()
  async add(
    @Param('ticketId') ticketId: string,
    @Body() body: { body: string; is_internal?: boolean },
    @Request() req,
  ) {
    if (!body.body) {
      throw new BadRequestException('Comment body is required');
    }
    const data = await this.commentsService.add(ticketId, req.user, body);
    return { data };
  }
}
