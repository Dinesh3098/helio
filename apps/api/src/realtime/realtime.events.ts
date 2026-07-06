/**
 * Wire protocol for the realtime layer. Documented in docs/realtime.md —
 * keep both in sync.
 */
export const CLIENT_EVENTS = {
  /** Agents only: subscribe to every message/update in a workspace. */
  joinWorkspace: 'joinWorkspace',
  joinConversation: 'joinConversation',
  leaveConversation: 'leaveConversation',
  sendMessage: 'sendMessage',
  typingStart: 'typingStart',
  typingStop: 'typingStop',
  /** Reserved for the read-receipts milestone; accepted but a no-op. */
  markConversationRead: 'markConversationRead',
} as const;

export const SERVER_EVENTS = {
  workspaceJoined: 'workspaceJoined',
  conversationJoined: 'conversationJoined',
  conversationLeft: 'conversationLeft',
  messageCreated: 'messageCreated',
  /** Status / priority / assignee changed — payload is the conversation. */
  conversationUpdated: 'conversationUpdated',
  typingStarted: 'typingStarted',
  typingStopped: 'typingStopped',
  messageError: 'messageError',
} as const;

export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

/**
 * Workspace-wide fan-out for dashboards. Conversation rooms alone are
 * not enough for agents: the inbox must update for conversations the
 * agent has NOT opened (new visitors, other threads). Visitors never
 * join these.
 */
export function workspaceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}
