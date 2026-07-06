import { Attachment } from './attachment.entity';
import { AuditLog } from './audit-log.entity';
import { AutomationExecution } from './automation-execution.entity';
import { AutomationRule } from './automation-rule.entity';
import { Contact } from './contact.entity';
import { Conversation } from './conversation.entity';
import { ConversationAssignment } from './conversation-assignment.entity';
import { ConversationSummary } from './conversation-summary.entity';
import { CustomDomain } from './custom-domain.entity';
import { EmailAccount } from './email-account.entity';
import { EmailThread } from './email-thread.entity';
import { HelpArticle } from './help-article.entity';
import { HelpCategory } from './help-category.entity';
import { Message } from './message.entity';
import { User } from './user.entity';
import { UserSession } from './user-session.entity';
import { Workspace } from './workspace.entity';
import { WorkspaceMember } from './workspace-member.entity';

export * from './attachment.entity';
export * from './audit-log.entity';
export * from './automation-execution.entity';
export * from './automation-rule.entity';
export * from './contact.entity';
export * from './conversation.entity';
export * from './conversation-assignment.entity';
export * from './conversation-summary.entity';
export * from './custom-domain.entity';
export * from './email-account.entity';
export * from './email-thread.entity';
export * from './help-article.entity';
export * from './help-category.entity';
export * from './message.entity';
export * from './user.entity';
export * from './user-session.entity';
export * from './workspace.entity';
export * from './workspace-member.entity';

/**
 * Explicit registration list consumed by DatabaseModule
 * (autoLoadEntities is intentionally false).
 */
export const entities = [
  Attachment,
  AuditLog,
  AutomationExecution,
  AutomationRule,
  Contact,
  Conversation,
  ConversationAssignment,
  ConversationSummary,
  CustomDomain,
  EmailAccount,
  EmailThread,
  HelpArticle,
  HelpCategory,
  Message,
  User,
  UserSession,
  Workspace,
  WorkspaceMember,
];
