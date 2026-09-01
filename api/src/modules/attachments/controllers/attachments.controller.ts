import { Controller, Get, Post, Body, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AttachmentsService } from '../services/attachments.service';

@Controller('/v1/tickets/:ticketId/attachments')
@UseGuards(JwtAuthGuard)
export class TicketAttachmentsController {
  constructor(private attachmentsService: AttachmentsService) {}

  @Get()
  async list(@Param('ticketId') ticketId: string, @Request() req) {
    const data = await this.attachmentsService.listForTicket(ticketId, req.user);
    return { data };
  }

  @Post('request-upload')
  async requestUpload(
    @Param('ticketId') ticketId: string,
    @Body() body: { filename: string; content_type: string; size_bytes: number },
    @Request() req,
  ) {
    if (!body.filename || !body.content_type || !body.size_bytes) {
      throw new BadRequestException('filename, content_type, and size_bytes are required');
    }
    const result = await this.attachmentsService.requestUpload(ticketId, req.user, body);
    return { data: result };
  }

  @Post(':attachmentId/confirm')
  async confirm(
    @Param('ticketId') ticketId: string,
    @Param('attachmentId') attachmentId: string,
    @Request() req,
  ) {
    const data = await this.attachmentsService.confirmUpload(ticketId, attachmentId, req.user);
    return { data };
  }
}

@Controller('/v1/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private attachmentsService: AttachmentsService) {}

  @Get(':id/download')
  async download(@Param('id') id: string, @Request() req) {
    const data = await this.attachmentsService.getDownloadUrl(id, req.user);
    return { data };
  }
}
