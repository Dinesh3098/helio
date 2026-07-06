import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RequestContextInterceptor } from "./common/request-context/request-context.interceptor";
import { RequestContextModule } from "./common/request-context/request-context.module";
import { HttpMetricsInterceptor } from "./metrics/http-metrics.interceptor";
import { MetricsModule } from "./metrics/metrics.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AuditModule } from "./modules/audit/audit.module";
import configuration, { AppConfig } from "./config/configuration";
import { envValidationSchema } from "./config/env.validation";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ContactsModule } from "./modules/contacts/contacts.module";
import { ConversationsModule } from "./modules/conversations/conversations.module";
import { MessagesModule } from "./modules/messages/messages.module";
import { ConversationEventsModule } from "./events/conversation-events.module";
import { AiModule } from "./modules/ai/ai.module";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { AutomationModule } from "./modules/automation/automation.module";
import { EmailModule } from "./modules/email/email.module";
import { KbModule } from "./modules/kb/kb.module";
import { WidgetModule } from "./modules/widget/widget.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { WorkspaceMembersModule } from "./modules/workspace-members/workspace-members.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { RedisModule } from "./redis/redis.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
      // Turbo runs each app from its own directory; the shared .env lives
      // at the repository root.
      envFilePath: [".env", "../../.env"],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const nodeEnv = config.get("nodeEnv", { infer: true });
        const isDevelopment = nodeEnv === "development";
        return {
          pinoHttp: {
            // Silent under test: hundreds of request-completion lines
            // would drown Jest output without telling us anything.
            level:
              nodeEnv === "test" ? "silent" : isDevelopment ? "debug" : "info",
            transport: isDevelopment
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
            redact: ["req.headers.authorization", "req.headers.cookie"],
            // Set by the correlation middleware in main.ts.
            genReqId: (req) => (req as { id?: string }).id ?? "unknown",
            // Evaluated when the completion line is written — after the
            // guards, so the resolved identity/tenant are available.
            customProps: (req) => {
              const r = req as {
                id?: string;
                user?: { id: string };
                workspaceMembership?: { workspaceId: string };
                originalUrl?: string;
                method?: string;
              };
              return {
                requestId: r.id,
                userId: r.user?.id,
                workspaceId: r.workspaceMembership?.workspaceId,
                route: r.originalUrl,
                method: r.method,
              };
            },
          },
        };
      },
    }),
    DatabaseModule,
    RedisModule,
    RequestContextModule,
    AuditModule,
    MetricsModule,
    ConversationEventsModule,
    HealthModule,
    AuthModule,
    WorkspaceMembersModule,
    WorkspacesModule,
    ContactsModule,
    ConversationsModule,
    MessagesModule,
    WidgetModule,
    KbModule,
    AiModule,
    EmailModule,
    AutomationModule,
    AttachmentsModule,
    AdminModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
