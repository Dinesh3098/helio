import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Contact, Conversation } from "../../database/entities";
import { ConversationsModule } from "../conversations/conversations.module";
import { WorkspaceMembersModule } from "../workspace-members/workspace-members.module";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, Conversation]),
    WorkspaceMembersModule,
    ConversationsModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
