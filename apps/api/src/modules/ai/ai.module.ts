import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Conversation,
  ConversationSummary,
  HelpArticle,
  Workspace,
} from '../../database/entities';
import { MessagesModule } from '../messages/messages.module';
import { WorkspaceMembersModule } from '../workspace-members/workspace-members.module';
import { AiRateLimitGuard } from './ai-rate-limit.guard';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AI_PROVIDER } from './providers/ai-provider.interface';
import { GeminiProvider } from './providers/gemini.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationSummary,
      HelpArticle,
      Workspace,
    ]),
    MessagesModule,
    // RolesGuard resolves the caller's membership through this module.
    WorkspaceMembersModule,
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiRateLimitGuard,
    // Swap the provider here to change AI vendors — nothing else moves.
    { provide: AI_PROVIDER, useClass: GeminiProvider },
  ],
  // Exported for the automation engine's AI actions.
  exports: [AiService],
})
export class AiModule {}
