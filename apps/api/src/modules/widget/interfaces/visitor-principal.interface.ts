/**
 * Identity carried by a visitor token. The conversation is pinned here at
 * session creation — widget clients never supply conversation ids.
 */
export interface VisitorPrincipal {
  contactId: string;
  workspaceId: string;
  conversationId: string;
  name: string;
}
