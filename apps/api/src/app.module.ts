import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import configuration, { AppConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { WorkspaceMembersModule } from './modules/workspace-members/workspace-members.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
      // Turbo runs each app from its own directory; the shared .env lives
      // at the repository root.
      envFilePath: ['.env', '../../.env'],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const isDevelopment =
          config.get('nodeEnv', { infer: true }) === 'development';
        return {
          pinoHttp: {
            level: isDevelopment ? 'debug' : 'info',
            transport: isDevelopment
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
        };
      },
    }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    WorkspaceMembersModule,
    WorkspacesModule,
    ContactsModule,
    ConversationsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
