import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagerService } from './services/manager.service';
import { ManagerTeamsController, ManagerTicketsController } from './controllers/manager.controller';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [ManagerTeamsController, ManagerTicketsController],
  providers: [ManagerService],
  exports: [ManagerService],
})
export class ManagerModule {}
