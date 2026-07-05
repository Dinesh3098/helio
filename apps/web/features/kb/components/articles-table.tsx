"use client";

import { formatDistanceToNow } from "date-fns";
import { BookOpen, Loader2, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { KbArticleSummary } from "@/types/api";
import { useDeleteArticle, useKbArticles, useKbCategories } from "../hooks";

const PAGE_LIMIT = 20;
const ALL_CATEGORIES = "all";

type StatusFilter = "all" | "published" | "draft";

export function ArticlesTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [articleToDelete, setArticleToDelete] =
    useState<KbArticleSummary | null>(null);

  const debouncedSearch = useDebouncedValue(search);
  const categories = useKbCategories();
  const deleteArticle = useDeleteArticle();

  const articles = useKbArticles({
    search: debouncedSearch,
    categoryId: categoryId === ALL_CATEGORIES ? undefined : categoryId,
    published:
      statusFilter === "all" ? undefined : statusFilter === "published",
    page,
  });

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search
            className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search articles…"
            aria-label="Search articles"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
          />
        </div>

        <Select
          value={categoryId}
          onValueChange={(value) => {
            setCategoryId(value);
            resetPage();
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
            {categories.data?.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as StatusFilter);
            resetPage();
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="draft">Drafts</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {articles.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : articles.isError ? (
        <ErrorState error={articles.error} onRetry={articles.refetch} />
      ) : articles.data.data.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={
            debouncedSearch ? "No matching articles" : "No articles yet"
          }
          description={
            debouncedSearch
              ? "Try different search terms."
              : "Write your first help article to get started."
          }
          action={
            !debouncedSearch ? (
              <Button
                onClick={() => router.push("/knowledge-base/articles/new")}
              >
                New article
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.data.data.map((article) => (
                  <TableRow
                    key={article.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/knowledge-base/articles/${article.id}`)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        router.push(`/knowledge-base/articles/${article.id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <p className="font-medium">{article.title}</p>
                      {article.excerpt && (
                        <p className="text-muted-foreground line-clamp-1 text-xs">
                          {article.excerpt}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {article.categoryName}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={article.isPublished ? "default" : "secondary"}
                      >
                        {article.isPublished ? "Published" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(article.updatedAt), {
                        addSuffix: true,
                      })}
                      {article.updatedByName && (
                        <span className="block text-xs">
                          by {article.updatedByName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${article.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setArticleToDelete(article);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            page={page}
            total={articles.data.total}
            limit={PAGE_LIMIT}
            onPageChange={setPage}
          />
        </>
      )}

      <Dialog
        open={articleToDelete !== null}
        onOpenChange={(open) => !open && setArticleToDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete article</DialogTitle>
            <DialogDescription>
              {articleToDelete
                ? `"${articleToDelete.title}" will be permanently deleted. This cannot be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArticleToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteArticle.isPending}
              onClick={() => {
                if (!articleToDelete) return;
                deleteArticle.mutate(articleToDelete.id, {
                  onSettled: () => setArticleToDelete(null),
                });
              }}
            >
              {deleteArticle.isPending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
