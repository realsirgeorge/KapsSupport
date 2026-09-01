import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { CommentsController } from './controllers/comments.controller';
import { CommentsService } from './services/comments.service';

@Module({
  imports: [TicketsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
