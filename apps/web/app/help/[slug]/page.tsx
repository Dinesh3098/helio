"use client";

import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense, use } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Markdown } from "@/components/shared/markdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHelpArticle } from "@/features/kb/hooks";
import {
  helpUrl,
  useHelpWorkspace,
} from "@/features/kb/use-help-workspace";

function HelpArticleContent({ slug }: { slug: string }) {
  const workspaceId = useHelpWorkspace();
  const article = useHelpArticle(workspaceId, slug);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Button variant="ghost" size="sm" asChild>
        <Link href={helpUrl("/help", workspaceId)}>
          <ArrowLeft className="size-4" aria-hidden />
          All articles
        </Link>
      </Button>

      {article.isPending ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : article.isError ? (
        <ErrorState error={article.error} onRetry={article.refetch} />
      ) : (
        <article className="mt-6">
          <p className="text-muted-foreground text-sm">
            {article.data.categoryName}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {article.data.title}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Updated {format(new Date(article.data.updatedAt), "MMMM d, yyyy")}
          </p>
          <div className="mt-8">
            <Markdown content={article.data.content} />
          </div>
        </article>
      )}
    </main>
  );
}

export default function HelpArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <Suspense fallback={null}>
      <HelpArticleContent slug={slug} />
    </Suspense>
  );
}
