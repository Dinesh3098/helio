/**
 * Wire protocol for the realtime layer. Documented in docs/realtime.md —
 * keep both in sync.
 */
export const CLIENT_EVENTS = {
  joinConversation: 'joinConversation',
  leaveConversation: 'leaveConversation',
  sendMessage: 'sendMessage',
  typingStart: 'typingStart',
  typingStop: 'typingStop',
  /** Reserved for the read-receipts milestone; accepted but a no-op. */
  markConversationRead: 'markConversationRead',
} as const;

export const SERVER_EVENTS = {
  conversationJoined: 'conversationJoined',
  conversationLeft: 'conversationLeft',
  messageCreated: 'messageCreated',
  typingStarted: 'typingStarted',
  typingStopped: 'typingStopped',
  messageError: 'messageError',
} as const;

export function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}
