import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Contact,
  Conversation,
  EmailAccount,
  EmailThread,
} from '../../database/entities';
import { RealtimeModule } from '../../realtime/realtime.module';
import { MessagesModule } from '../messages/messages.module';
import { WorkspaceMembersModule } from '../workspace-members/workspace-members.module';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { EMAIL_PROVIDER } from './providers/provider.interface';
import { ResendProvider } from './providers/resend.provider';
import { EmailWebhookController } from './webhooks/email-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailAccount,
      EmailThread,
      Contact,
      Conversation,
    ]),
    MessagesModule,
    RealtimeModule,
    // RolesGuard resolves the caller's membership through this module.
    WorkspaceMembersModule,
  ],
  controllers: [EmailController, EmailWebhookController],
  providers: [
    EmailService,
    // Swap here for SMTP/SES/SendGrid — nothing else changes.
    { provide: EMAIL_PROVIDER, useClass: ResendProvider },
  ],
})
export class EmailModule {}
