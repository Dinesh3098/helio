"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArticleEditor } from "@/features/kb/components/article-editor";
import { useKbArticle } from "@/features/kb/hooks";

export default function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const article = useKbArticle(id);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/knowledge-base">
          <ArrowLeft className="size-4" aria-hidden />
          Back to articles
        </Link>
      </Button>

      {article.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : article.isError ? (
        <ErrorState error={article.error} onRetry={article.refetch} />
      ) : (
        <>
          <PageHeader
            title="Edit article"
            description={
              article.data.createdByName
                ? `Created by ${article.data.createdByName}`
                : undefined
            }
          />
          {/* key forces a clean form when navigating between articles */}
          <ArticleEditor key={article.data.id} article={article.data} />
        </>
      )}
    </div>
  );
}
