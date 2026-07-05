import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Conversation,
  ConversationAssignment,
  ConversationSummary,
  Message,
} from '../../database/entities';
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
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
