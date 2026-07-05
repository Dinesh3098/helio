export interface SummaryPromptInput {
  contactName: string;
  transcript: string;
}

export function conversationSummaryPrompt(input: SummaryPromptInput): string {
  return `You are a customer-support assistant. Summarize the following support conversation with the customer "${input.contactName}".

Write 2-4 concise sentences covering:
- what the customer wants or reports,
- what has been done or answered so far,
- anything still unresolved or awaiting action.

Plain text only, no headings, no bullet points, no preamble.

Conversation:
${input.transcript}`;
}
