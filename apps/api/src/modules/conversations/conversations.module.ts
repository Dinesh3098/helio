import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Conversation,
  ConversationAssignment,
  ConversationSummary,
  Message,
} from '../../database/entities';
import { RealtimeEmitterModule } from '../../realtime/realtime-emitter.module';
import { MessagesModule } from '../messages/messages.module';
import { WorkspaceMembersModule } from '../workspace-members/workspace-members.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationAssignment,
      ConversationSummary,
      Message,
    ]),
    WorkspaceMembersModule,
    RealtimeEmitterModule,
    // Timeline interleaves the message feed with audit events.
    MessagesModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
