export const REWRITE_STYLES = [
  "PROFESSIONAL",
  "FRIENDLY",
  "SHORTER",
  "LONGER",
  "GRAMMAR",
] as const;

export type RewriteStyle = (typeof REWRITE_STYLES)[number];

const STYLE_INSTRUCTIONS: Record<RewriteStyle, string> = {
  PROFESSIONAL:
    "Rewrite it in a professional, courteous business tone while keeping the meaning intact.",
  FRIENDLY:
    "Rewrite it in a warm, friendly, approachable tone while keeping the meaning intact.",
  SHORTER:
    "Rewrite it to be significantly shorter and more direct without losing any essential information.",
  LONGER:
    "Expand it with more detail, empathy, and helpful context while staying on topic.",
  GRAMMAR:
    "Fix spelling, grammar, and punctuation only. Change nothing else about wording or tone.",
};

export interface RewritePromptInput {
  draft: string;
  style: RewriteStyle;
}

export function rewritePrompt(input: RewritePromptInput): string {
  return `You are editing a customer-support reply draft. ${STYLE_INSTRUCTIONS[input.style]}

Output only the rewritten text — no explanation, no quotes, no preamble.

Draft:
${input.draft}`;
}
