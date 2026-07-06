import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment, Conversation } from '../../database/entities';
import { StorageModule } from '../storage/storage.module';
import { WorkspaceMembersModule } from '../workspace-members/workspace-members.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attachment, Conversation]),
    StorageModule,
    // RolesGuard resolves the caller's membership through this module.
    WorkspaceMembersModule,
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
