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

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
