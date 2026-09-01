import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TriageService } from './services/triage.service';
import { TriageController, TriageTicketsController } from './controllers/triage.controller';

@Module({
  imports: [TypeOrmModule.forFeature([])], // Entity repos would go here
  controllers: [TriageController, TriageTicketsController],
  providers: [TriageService],
  exports: [TriageService],
})
export class TriageModule {}
