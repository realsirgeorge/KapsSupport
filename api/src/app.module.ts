import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppDataSource } from './database/data-source';
import { AuthModule } from './modules/auth/auth.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { TeamsModule } from './modules/teams/teams.module';
import { UsersModule } from './modules/users/users.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { ManagerModule } from './modules/manager/manager.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { TriageModule } from './modules/triage/triage.module';
import { AdminModule } from './modules/admin/admin.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot(AppDataSource.options as any),
    EventEmitterModule.forRoot({
      wildcard: false,
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    AuthModule,
    TicketsModule,
    TeamsModule,
    UsersModule,
    AvailabilityModule,
    ManagerModule,
    DashboardModule,
    TriageModule,
    AdminModule,
    AttachmentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
