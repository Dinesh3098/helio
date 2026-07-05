/** Central query-key registry so invalidation never uses ad-hoc strings. */
export const queryKeys = {
  me: ["auth", "me"] as const,
  workspace: ["workspace"] as const,
  members: ["workspace", "members"] as const,
  contacts: (params: { search?: string; page: number }) =>
    ["contacts", params] as const,
  contact: (id: string) => ["contacts", id] as const,
  contactConversations: (id: string) =>
    ["contacts", id, "conversations"] as const,
  conversations: (params: { status?: string; page: number }) =>
    ["conversations", params] as const,
  conversation: (id: string) => ["conversations", id] as const,
  messages: (conversationId: string) =>
    ["conversations", conversationId, "messages"] as const,
};
