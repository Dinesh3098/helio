import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Conversation, Message, User } from "../../database/entities";
import { AttachmentsModule } from "../attachments/attachments.module";
import { WorkspaceMembersModule } from "../workspace-members/workspace-members.module";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Conversation, User]),
    // RolesGuard resolves the caller's membership through this module.
    WorkspaceMembersModule,
    AttachmentsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
