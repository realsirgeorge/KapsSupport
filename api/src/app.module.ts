import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppDataSource } from './database/data-source';
import { AuthModule } from './modules/auth/auth.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { TeamsModule } from './modules/teams/teams.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'postgres',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      username: process.env.DATABASE_USER || 'support_app',
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME || 'support_ticketing',
      synchronize: false,
      logging: process.env.NODE_ENV !== 'production',
      entities: [],
      migrations: [],
    }),
    EventEmitterModule.forRoot(),
    AuthModule,
    TicketsModule,
    TeamsModule,
    UsersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
