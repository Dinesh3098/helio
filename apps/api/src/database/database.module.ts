import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { entities } from './entities';

/**
 * PostgreSQL via TypeORM. `synchronize` stays off permanently — schema
 * changes will ship as migrations once entities exist.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        type: 'postgres',
        url: config.get('database.url', { infer: true }),
        entities,
        autoLoadEntities: false,
        synchronize: false,
        logging: false,
        retryAttempts: 3,
        retryDelay: 3000,
      }),
    }),
  ],
})
export class DatabaseModule {}
