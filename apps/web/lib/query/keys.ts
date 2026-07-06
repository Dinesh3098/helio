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
  ai: (conversationId: string) => ["ai", conversationId] as const,
  aiSummary: (conversationId: string) =>
    ["ai", conversationId, "summary"] as const,
  aiClassification: (conversationId: string) =>
    ["ai", conversationId, "classification"] as const,
  aiKbSuggestions: (conversationId: string) =>
    ["ai", conversationId, "kb"] as const,
  auditLogs: (params: { resourceType?: string; page: number }) =>
    ["audit", "logs", params] as const,
  systemStatus: ["admin", "system"] as const,
  timeline: (conversationId: string) =>
    ["conversations", conversationId, "timeline"] as const,
  automationRules: ["automation", "rules"] as const,
  automationHistory: (params: { ruleId?: string; page: number }) =>
    ["automation", "history", params] as const,
  kbCategories: ["kb", "categories"] as const,
  kbArticles: (params: {
    search?: string;
    categoryId?: string;
    published?: boolean;
    sortBy?: string;
    sortOrder?: string;
    page: number;
  }) => ["kb", "articles", params] as const,
  kbArticle: (id: string) => ["kb", "articles", id] as const,
  helpCenter: (workspaceId: string) => ["help", workspaceId] as const,
  helpArticle: (workspaceId: string, slug: string) =>
    ["help", workspaceId, slug] as const,
  helpSearch: (workspaceId: string, q: string) =>
    ["help", workspaceId, "search", q] as const,
};
