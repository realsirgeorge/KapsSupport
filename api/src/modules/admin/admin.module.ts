import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './services/admin.service';
import {
  AdminTeamsController,
  AdminSitesController,
  AdminCategoriesController,
  AdminUsersController,
  AdminTicketSiteCorrectionController,
} from './controllers/admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [
    AdminTeamsController,
    AdminSitesController,
    AdminCategoriesController,
    AdminUsersController,
    AdminTicketSiteCorrectionController,
  ],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
