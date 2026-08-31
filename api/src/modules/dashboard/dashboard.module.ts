import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController, DashboardSystemController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([])], // Entity repos would go here
  controllers: [DashboardController, DashboardSystemController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
