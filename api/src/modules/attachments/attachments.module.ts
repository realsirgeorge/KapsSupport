import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { TicketAttachmentsController, AttachmentsController } from './controllers/attachments.controller';
import { AttachmentsService } from './services/attachments.service';

@Module({
  imports: [TicketsModule],
  controllers: [TicketAttachmentsController, AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
