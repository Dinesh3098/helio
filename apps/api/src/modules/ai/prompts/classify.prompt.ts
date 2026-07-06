export interface ClassifyPromptInput {
  transcript: string;
}

/** Categories/enums the model must choose from — mirrored in the DTO. */
export const CLASSIFY_SCHEMA = {
  priorities: ["LOW", "MEDIUM", "HIGH"] as const,
  sentiments: ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const,
};

export function classifyPrompt(input: ClassifyPromptInput): string {
  return `Classify the following customer-support conversation.

Respond with a single JSON object, nothing else, using exactly this shape:
{
  "category": "<one or two words, e.g. Billing, Technical Issue, Account, Shipping, Feedback, Other>",
  "priority": "<LOW | MEDIUM | HIGH>",
  "sentiment": "<POSITIVE | NEUTRAL | NEGATIVE>",
  "intent": "<short phrase describing what the customer wants, e.g. Refund Request>"
}

Conversation:
${input.transcript}`;
}
