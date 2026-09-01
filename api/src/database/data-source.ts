import 'dotenv/config';
import { DataSource } from 'typeorm';
import path from 'path';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'postgres',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'support_app',
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME || 'support_ticketing',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  entities: [path.join(__dirname, '../entities', '*.{ts,js}')],
  subscribers: [path.join(__dirname, '../subscribers', '*.{ts,js}')],
});
