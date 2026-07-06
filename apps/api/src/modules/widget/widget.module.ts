import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/configuration';
import { Contact, Conversation, Workspace } from '../../database/entities';
import { AttachmentsModule } from '../attachments/attachments.module';
import { MessagesModule } from '../messages/messages.module';
import { WidgetAuthGuard } from './widget-auth.guard';
import { WidgetAuthService } from './widget-auth.service';
import { WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace, Contact, Conversation]),
    MessagesModule,
    AttachmentsModule,
    // Same secret as agent JWTs; visitor tokens differ by payload shape
    // (typ: 'visitor') and set their own expiry at sign time.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt.secret', { infer: true }),
      }),
    }),
  ],
  controllers: [WidgetController],
  providers: [WidgetService, WidgetAuthService, WidgetAuthGuard],
  // WidgetAuthService is exported for the realtime gateway's handshake.
  exports: [WidgetAuthService],
})
export class WidgetModule {}
