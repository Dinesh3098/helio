export interface WidgetAttachment {
  id?: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
}

/** Mirrors the API's MessageResponseDto. USER = agent, CONTACT = visitor. */
export interface WidgetMessage {
  id: string;
  conversationId: string;
  senderType: "USER" | "CONTACT";
  senderId: string | null;
  senderName: string | null;
  content: string;
  messageType: "TEXT" | "SYSTEM";
  metadata?: { attachments?: WidgetAttachment[] } | null;
  createdAt: string;
  /** Local-only flags for the optimistic send flow. */
  pending?: boolean;
  failed?: boolean;
}

export interface MessagesPage {
  data: WidgetMessage[];
  nextCursor: string | null;
}

/** Mirrors the API's WidgetSessionResponseDto. */
export interface WidgetSession {
  visitorToken: string;
  contact: { id: string; name: string };
  conversation: { id: string; status: "OPEN" | "SNOOZED" | "RESOLVED" };
  workspace: { name: string };
}
