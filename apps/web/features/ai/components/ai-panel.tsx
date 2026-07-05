"use client";

import { formatDistanceToNow } from "date-fns";
import {
  BookOpen,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Sparkles,
  Tags,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { RewriteStyle } from "../api";
import {
  useAiSummary,
  useClassification,
  useGenerateSummary,
  useKbSuggestions,
  useRewriteDraft,
  useSuggestReply,
} from "../hooks";

const REWRITE_STYLES: { style: RewriteStyle; label: string }[] = [
  { style: "PROFESSIONAL", label: "Professional" },
  { style: "FRIENDLY", label: "Friendly" },
  { style: "SHORTER", label: "Shorter" },
  { style: "LONGER", label: "Longer" },
  { style: "GRAMMAR", label: "Grammar" },
];

const SENTIMENT_STYLES: Record<string, string> = {
  POSITIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  NEUTRAL: "bg-muted text-muted-foreground",
  NEGATIVE: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Sparkles;
  title: string;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="size-4" aria-hidden />
      {title}
    </h3>
  );
}

function InlineError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-destructive text-xs">{getApiErrorMessage(error)}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Agent-assist sidebar. Everything here is review-first — the AI never sends. */
export function AiPanel({ conversationId }: { conversationId: string }) {
  const setComposerDraft = useUiStore((s) => s.setComposerDraft);

  const summary = useAiSummary(conversationId);
  const generateSummary = useGenerateSummary(conversationId);
  const suggestReply = useSuggestReply(conversationId);
  const rewrite = useRewriteDraft();
  const classification = useClassification(conversationId);
  const kbSuggestions = useKbSuggestions(conversationId);

  const [instructions, setInstructions] = useState("");

  const insertIntoComposer = (text: string) => {
    const draft = useUiStore.getState().composerDraft.trim();
    setComposerDraft(draft ? `${draft}\n\n${text}` : text);
  };

  const rewriteDraft = (style: RewriteStyle) => {
    const draft = useUiStore.getState().composerDraft.trim();
    if (!draft) return;
    rewrite.mutate({ draft, style });
  };

  return (
    <aside
      aria-label="AI assistant"
      className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l p-4"
    >
      {/* ---------- Summary ---------- */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionHeader icon={Sparkles} title="AI Summary" />
          {summary.data && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Refresh summary"
              disabled={generateSummary.isPending}
              onClick={() => generateSummary.mutate()}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  generateSummary.isPending && "animate-spin",
                )}
                aria-hidden
              />
            </Button>
          )}
        </div>

        {summary.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ) : summary.isError ? (
          <InlineError error={summary.error} onRetry={summary.refetch} />
        ) : summary.data ? (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-sm">
              {summary.data.summary}
            </p>
            <p className="text-muted-foreground/70 text-xs">
              {formatDistanceToNow(new Date(summary.data.updatedAt), {
                addSuffix: true,
              })}
              {summary.data.stale && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  Outdated — new messages
                </Badge>
              )}
            </p>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={generateSummary.isPending}
            onClick={() => generateSummary.mutate()}
          >
            {generateSummary.isPending && (
              <Loader2 className="animate-spin" aria-hidden />
            )}
            Generate summary
          </Button>
        )}
      </section>

      <Separator />

      {/* ---------- Suggested reply ---------- */}
      <section className="space-y-2">
        <SectionHeader icon={MessageSquarePlus} title="Suggested Reply" />
        <Input
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Optional instructions (e.g. offer a refund)"
          aria-label="Reply instructions"
          className="h-8 text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={suggestReply.isPending}
          onClick={() => suggestReply.mutate(instructions)}
        >
          {suggestReply.isPending && (
            <Loader2 className="animate-spin" aria-hidden />
          )}
          Generate reply
        </Button>

        {suggestReply.data && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {suggestReply.data}
            </p>
            <Button
              size="sm"
              onClick={() => insertIntoComposer(suggestReply.data)}
            >
              Insert into composer
            </Button>
          </div>
        )}
      </section>

      <Separator />

      {/* ---------- Rewrite ---------- */}
      <section className="space-y-2">
        <SectionHeader icon={Wand2} title="Rewrite Draft" />
        <p className="text-muted-foreground text-xs">
          Rewrites what&apos;s currently in the composer.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {REWRITE_STYLES.map(({ style, label }) => (
            <Button
              key={style}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={rewrite.isPending}
              onClick={() => rewriteDraft(style)}
            >
              {label}
            </Button>
          ))}
          {rewrite.isPending && (
            <Loader2 className="text-muted-foreground size-4 animate-spin self-center" />
          )}
        </div>
      </section>

      <Separator />

      {/* ---------- Analysis ---------- */}
      <section className="space-y-2">
        <SectionHeader icon={Tags} title="Conversation Analysis" />
        {classification.isFetching ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : classification.isError ? (
          <InlineError
            error={classification.error}
            onRetry={classification.refetch}
          />
        ) : classification.data ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Category</dt>
            <dd>
              <Badge variant="secondary">{classification.data.category}</Badge>
            </dd>
            <dt className="text-muted-foreground">Priority</dt>
            <dd>
              <Badge
                variant={
                  classification.data.priority === "HIGH"
                    ? "destructive"
                    : "secondary"
                }
              >
                {classification.data.priority}
              </Badge>
            </dd>
            <dt className="text-muted-foreground">Sentiment</dt>
            <dd>
              <Badge
                className={cn(
                  "border-transparent",
                  SENTIMENT_STYLES[classification.data.sentiment],
                )}
              >
                {classification.data.sentiment}
              </Badge>
            </dd>
            <dt className="text-muted-foreground">Intent</dt>
            <dd className="text-sm">{classification.data.intent}</dd>
          </dl>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => classification.refetch()}
          >
            Analyze conversation
          </Button>
        )}
      </section>

      <Separator />

      {/* ---------- KB suggestions ---------- */}
      <section className="space-y-2">
        <SectionHeader icon={BookOpen} title="Knowledge Base" />
        {kbSuggestions.isFetching ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : kbSuggestions.isError ? (
          <InlineError
            error={kbSuggestions.error}
            onRetry={kbSuggestions.refetch}
          />
        ) : kbSuggestions.data ? (
          kbSuggestions.data.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No relevant articles found.
            </p>
          ) : (
            <ul className="space-y-2">
              {kbSuggestions.data.map((suggestion) => (
                <li
                  key={suggestion.articleId}
                  className="rounded-lg border p-2.5"
                >
                  <Link
                    href={`/knowledge-base/articles/${suggestion.articleId}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {suggestion.title}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {suggestion.reason}
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => kbSuggestions.refetch()}
          >
            Find relevant articles
          </Button>
        )}
      </section>
    </aside>
  );
}
