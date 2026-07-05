"use client";

import { BookOpen, FileQuestion, Search } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useHelpCenter, useHelpSearch } from "@/features/kb/hooks";
import {
  helpUrl,
  useHelpWorkspace,
} from "@/features/kb/use-help-workspace";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

function HelpCenterContent() {
  const workspaceId = useHelpWorkspace();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const helpCenter = useHelpCenter(workspaceId);
  const results = useHelpSearch(workspaceId, debouncedSearch);
  const searching = debouncedSearch.trim().length > 0;

  if (!workspaceId) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No workspace specified"
        description="Open this page as /help?workspace=<workspace-id>, or set NEXT_PUBLIC_DEMO_WORKSPACE_ID."
      />
    );
  }

  return (
    <>
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <p className="text-muted-foreground text-sm font-medium">
            {helpCenter.data?.workspaceName ?? "Help Center"}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            How can we help?
          </h1>
          <div className="relative mx-auto mt-6 max-w-lg">
            <Search
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search articles…"
              aria-label="Search help articles"
              className="h-11 pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {searching ? (
          results.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : results.isError ? (
            <ErrorState error={results.error} onRetry={results.refetch} />
          ) : results.data.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No results"
              description={`Nothing matched "${debouncedSearch}".`}
            />
          ) : (
            <ul className="space-y-3" aria-label="Search results">
              {results.data.map((article) => (
                <li key={article.slug}>
                  <Link
                    href={helpUrl(`/help/${article.slug}`, workspaceId)}
                    className="hover:bg-accent/50 block rounded-lg border p-4 transition-colors"
                  >
                    <p className="font-medium">{article.title}</p>
                    {article.excerpt && (
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                        {article.excerpt}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : helpCenter.isPending ? (
          <div className="space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        ) : helpCenter.isError ? (
          <ErrorState error={helpCenter.error} onRetry={helpCenter.refetch} />
        ) : helpCenter.data.categories.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No articles yet"
            description="Published articles will appear here."
          />
        ) : (
          <div className="space-y-10">
            {helpCenter.data.categories.map((category) => (
              <section key={category.id} aria-label={category.name}>
                <h2 className="mb-3 text-lg font-semibold">{category.name}</h2>
                <ul className="space-y-2">
                  {category.articles.map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={helpUrl(`/help/${article.slug}`, workspaceId)}
                        className="hover:bg-accent/50 block rounded-lg border p-4 transition-colors"
                      >
                        <p className="font-medium">{article.title}</p>
                        {article.excerpt && (
                          <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                            {article.excerpt}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

export default function HelpCenterPage() {
  return (
    <Suspense fallback={null}>
      <HelpCenterContent />
    </Suspense>
  );
}
