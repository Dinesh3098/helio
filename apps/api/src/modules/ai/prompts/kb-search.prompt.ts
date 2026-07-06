export interface KbSearchArticle {
  id: string;
  title: string;
  excerpt: string | null;
}

export interface KbSearchPromptInput {
  transcript: string;
  articles: KbSearchArticle[];
  maxResults: number;
}

export function kbSearchPrompt(input: KbSearchPromptInput): string {
  const catalog = input.articles
    .map(
      (article) =>
        `- id: ${article.id} | title: ${article.title}${
          article.excerpt ? ` | about: ${article.excerpt}` : ""
        }`,
    )
    .join("\n");

  return `You match support conversations to existing help-center articles.

From the article list below, pick up to ${input.maxResults} articles that would genuinely help resolve this conversation. Only pick from the list — never invent articles. If none are relevant, return an empty array.

Respond with a single JSON array, nothing else, using exactly this shape:
[{ "articleId": "<id from the list>", "reason": "<one sentence: why this article helps>" }]

Articles:
${catalog}

Conversation:
${input.transcript}`;
}
