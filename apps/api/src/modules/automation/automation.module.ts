import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  AutomationExecution,
  AutomationRule,
  Conversation,
} from "../../database/entities";
import { RealtimeEmitterModule } from "../../realtime/realtime-emitter.module";
import { AiModule } from "../ai/ai.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { MessagesModule } from "../messages/messages.module";
import { WorkspaceMembersModule } from "../workspace-members/workspace-members.module";
import { AutomationEngineService } from "./automation-engine.service";
import { AutomationEvaluator } from "./automation-evaluator.service";
import { AutomationExecutor } from "./automation-executor.service";
import { AutomationController } from "./automation.controller";
import { AutomationService } from "./automation.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AutomationRule,
      AutomationExecution,
      Conversation,
    ]),
    ConversationsModule,
    MessagesModule,
    AiModule,
    WorkspaceMembersModule,
    RealtimeEmitterModule,
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    AutomationEngineService,
    AutomationEvaluator,
    AutomationExecutor,
  ],
})
export class AutomationModule {}
