import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './controllers/tickets.controller';
import { TicketService } from './services/ticket.service';

@Module({
  imports: [TypeOrmModule.forFeature([])], // Entity repos would go here
  controllers: [TicketsController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketsModule {}
