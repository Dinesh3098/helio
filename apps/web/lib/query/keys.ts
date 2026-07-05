/** Central query-key registry so invalidation never uses ad-hoc strings. */
export const queryKeys = {
  me: ["auth", "me"] as const,
  myWorkspaces: ["auth", "workspaces"] as const,
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
  kbCategories: ["kb", "categories"] as const,
  kbArticles: (params: {
    search?: string;
    categoryId?: string;
    published?: boolean;
    page: number;
  }) => ["kb", "articles", params] as const,
  kbArticle: (id: string) => ["kb", "articles", id] as const,
  helpCenter: (workspaceId: string) => ["help", workspaceId] as const,
  helpArticle: (workspaceId: string, slug: string) =>
    ["help", workspaceId, slug] as const,
  helpSearch: (workspaceId: string, q: string) =>
    ["help", workspaceId, "search", q] as const,
};
