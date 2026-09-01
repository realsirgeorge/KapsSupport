import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AvailabilityController } from './controllers/availability.controller';
import { AvailabilityService } from './services/availability.service';

@Module({
  imports: [TypeOrmModule.forFeature([])], // Entity repos would be added here
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
