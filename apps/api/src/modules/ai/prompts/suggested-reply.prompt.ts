export interface SuggestedReplyPromptInput {
  contactName: string;
  agentName: string;
  workspaceName: string;
  transcript: string;
  instructions?: string;
}

export function suggestedReplyPrompt(input: SuggestedReplyPromptInput): string {
  return `You are drafting a reply for "${input.agentName}", a support agent at "${input.workspaceName}", to send to the customer "${input.contactName}".

Rules:
- Write only the reply body, ready to send. No subject line, no quotes around it, no explanation.
- Professional, warm, and concise. Address the customer's latest concern directly.
- Do not invent order numbers, policies, prices, or facts that are not in the conversation.
- If information is missing, ask the customer for it politely.${
    input.instructions
      ? `\n- Additional instructions from the agent: ${input.instructions}`
      : ""
  }

Conversation:
${input.transcript}`;
}
