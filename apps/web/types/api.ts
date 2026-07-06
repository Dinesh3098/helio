// Mirrors the backend response DTOs (apps/api).

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  workspace?: Workspace;
  accessToken: string;
  refreshToken: string;
}

export type WorkspaceRole = "OWNER" | "ADMIN" | "AGENT";

export interface MyWorkspace {
  workspaceId: string;
  name: string;
  role: WorkspaceRole;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactDetail extends Contact {
  totalConversations: number;
  openConversations: number;
  lastConversationAt: string | null;
}

export type ConversationStatus = "OPEN" | "SNOOZED" | "RESOLVED";
export type ConversationChannel = "CHAT" | "EMAIL";
export type ConversationPriority = "LOW" | "MEDIUM" | "HIGH";

export interface Conversation {
  id: string;
  contactId: string;
  contactName: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  priority: ConversationPriority;
  subject: string | null;
  tags: string[];
  assignedToUserId: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends Conversation {
  contact: Contact;
  assignee: { userId: string; name: string; email: string } | null;
  aiSummary: { summary: string; model: string; updatedAt: string } | null;
  messagesCount: number;
}

/** USER = workspace agent, CONTACT = customer. */
export type MessageSenderType = "USER" | "CONTACT";
export type MessageType = "TEXT" | "SYSTEM";

export interface MessageAttachment {
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
}

/** Channel extras — email envelope; null for chat messages. */
export interface MessageMetadata {
  email?: {
    subject: string | null;
    from: string;
    to: string;
    messageId: string | null;
    html: string | null;
    attachments: MessageAttachment[];
  };
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId: string | null;
  senderName: string | null;
  content: string;
  messageType: MessageType;
  metadata: MessageMetadata | null;
  createdAt: string;
}

export interface MessagesPage {
  data: Message[];
  nextCursor: string | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface KbCategory {
  id: string;
  name: string;
  displayOrder: number;
  articlesCount: number;
  publishedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticleSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  isPublished: boolean;
  categoryId: string;
  categoryName: string;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KbArticle extends KbArticleSummary {
  content: string;
  createdByName: string | null;
}

export interface PublicArticleSummary {
  title: string;
  slug: string;
  excerpt: string | null;
  updatedAt: string;
}

export interface PublicHelpCenter {
  workspaceName: string;
  categories: {
    id: string;
    name: string;
    articles: PublicArticleSummary[];
  }[];
}

export interface PublicArticle extends PublicArticleSummary {
  content: string;
  categoryName: string;
  workspaceName: string;
}

export interface AuditLogEntry {
  id: string;
  actorName: string | null;
  resourceType: string;
  resourceId: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface SystemStatus {
  services: { name: string; status: string; latencyMs?: number }[];
  sockets: { connections: number; users: number };
  uptimeSeconds: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  version: string;
  environment: string;
  node: string;
}

export interface TimelineEvent {
  id: string;
  action: string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface TimelineEntry {
  kind: "message" | "event";
  at: string;
  message?: Message;
  event?: TimelineEvent;
}

export type AutomationTrigger =
  | "CONVERSATION_CREATED"
  | "MESSAGE_RECEIVED"
  | "MESSAGE_SENT"
  | "CONVERSATION_RESOLVED"
  | "CONVERSATION_REOPENED";

export type AutomationCondition =
  | { type: "channel"; value: ConversationChannel }
  | { type: "status"; value: ConversationStatus }
  | { type: "priority"; value: ConversationPriority }
  | { type: "emailDomain"; value: string }
  | { type: "messageContains"; value: string }
  | { type: "assignedTo"; value: string | null }
  | { type: "timeOfDay"; from: string; to: string };

export type AutomationAction =
  | { type: "assign"; userId: string }
  | { type: "setPriority"; priority: ConversationPriority }
  | { type: "setStatus"; status: ConversationStatus }
  | { type: "aiSummary" }
  | { type: "aiReply"; instructions?: string }
  | { type: "autoReply"; content: string }
  | { type: "addTag"; tag: string }
  | { type: "removeTag"; tag: string };

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AutomationExecutionStatus = "SUCCESS" | "FAILED";

export interface AutomationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  conversationId: string;
  contactName: string;
  status: AutomationExecutionStatus;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}
