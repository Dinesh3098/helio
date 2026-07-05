import { Module } from '@nestjs/common';
import { AuthModule } from '../modules/auth/auth.module';
import { ConversationsModule } from '../modules/conversations/conversations.module';
import { MessagesModule } from '../modules/messages/messages.module';
import { WidgetModule } from '../modules/widget/widget.module';
import { WorkspaceMembersModule } from '../modules/workspace-members/workspace-members.module';
import { ConnectionRegistryService } from './connection-registry.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [
    AuthModule,
    ConversationsModule,
    MessagesModule,
    WorkspaceMembersModule,
    WidgetModule,
  ],
  providers: [RealtimeGateway, ConnectionRegistryService],
  // Exported so the email module can broadcast inbound/outbound messages.
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
