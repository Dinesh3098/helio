"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Globe, GlobeLock, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Markdown } from "@/components/shared/markdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api/client";
import type { KbArticle } from "@/types/api";
import { useCreateArticle, useKbCategories, useUpdateArticle } from "../hooks";
import { articleSchema, type ArticleValues } from "../schemas";

const AUTOSAVE_DEBOUNCE_MS = 800;

function draftKey(articleId: string | null): string {
  return `helio:kb-draft:${articleId ?? "new"}`;
}

/**
 * Create + edit form with a Write/Preview toggle. Unsaved work is
 * autosaved to localStorage (debounced) and restored on return; the key
 * is cleared on successful save.
 */
export function ArticleEditor({ article }: { article: KbArticle | null }) {
  const router = useRouter();
  const categories = useKbCategories();
  const create = useCreateArticle();
  const update = useUpdateArticle();
  const mutation = article ? update : create;

  const [tab, setTab] = useState<"write" | "preview">("write");
  const [restoredDraft, setRestoredDraft] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<ArticleValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: article?.title ?? "",
      categoryId: article?.categoryId ?? "",
      excerpt: article?.excerpt ?? "",
      content: article?.content ?? "",
    },
  });

  // Restore an unsaved browser draft (deliberately after initial render,
  // never during it, to avoid hydration mismatches).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey(article?.id ?? null));
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<ArticleValues>;
      const current = form.getValues();
      const differs =
        saved.title !== current.title ||
        saved.content !== current.content ||
        saved.excerpt !== current.excerpt ||
        saved.categoryId !== current.categoryId;
      if (differs) {
        form.reset({ ...current, ...saved });
        setRestoredDraft(true);
      }
    } catch {
      // Corrupt draft — ignore it.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave of every change.
  useEffect(() => {
    const subscription = form.watch((values) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        try {
          window.localStorage.setItem(
            draftKey(article?.id ?? null),
            JSON.stringify(values),
          );
        } catch {
          // Storage full/blocked — autosave is best-effort.
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      subscription.unsubscribe();
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [form, article?.id]);

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(draftKey(article?.id ?? null));
    } catch {
      // ignore
    }
  };

  const onSubmit = form.handleSubmit((values) => {
    const payload = {
      title: values.title,
      categoryId: values.categoryId,
      excerpt: values.excerpt || undefined,
      content: values.content,
    };
    if (article) {
      update.mutate({ id: article.id, ...payload }, { onSuccess: clearDraft });
    } else {
      create.mutate(payload, {
        onSuccess: (created) => {
          clearDraft();
          router.replace(`/knowledge-base/articles/${created.id}`);
        },
      });
    }
  });

  const togglePublish = () => {
    if (!article) return;
    update.mutate({ id: article.id, isPublished: !article.isPublished });
  };

  const content = form.watch("content");

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {getApiErrorMessage(mutation.error)}
          </AlertDescription>
        </Alert>
      )}
      {restoredDraft && (
        <Alert>
          <AlertDescription>
            Restored unsaved changes from this browser.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div className="grid min-w-64 flex-1 gap-2">
          <Label htmlFor="article-title">Title</Label>
          <Input
            id="article-title"
            placeholder="How do I…"
            aria-invalid={!!form.formState.errors.title}
            {...form.register("title")}
          />
          {form.formState.errors.title && (
            <p className="text-destructive text-sm" role="alert">
              {form.formState.errors.title.message}
            </p>
          )}
        </div>

        <div className="grid w-56 gap-2">
          <Label htmlFor="article-category">Category</Label>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger
                  id="article-category"
                  className="w-full"
                  aria-invalid={!!form.formState.errors.categoryId}
                >
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.data?.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.categoryId && (
            <p className="text-destructive text-sm" role="alert">
              {form.formState.errors.categoryId.message}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="article-excerpt">
          Excerpt{" "}
          <span className="text-muted-foreground font-normal">
            (shown in listings and search)
          </span>
        </Label>
        <Input
          id="article-excerpt"
          placeholder="One-sentence summary"
          aria-invalid={!!form.formState.errors.excerpt}
          {...form.register("excerpt")}
        />
        {form.formState.errors.excerpt && (
          <p className="text-destructive text-sm" role="alert">
            {form.formState.errors.excerpt.message}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="article-content">Content (Markdown)</Label>
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as typeof tab)}
          >
            <TabsList>
              <TabsTrigger value="write">
                <Pencil className="size-3.5" aria-hidden /> Write
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="size-3.5" aria-hidden /> Preview
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {tab === "write" ? (
          <Textarea
            id="article-content"
            rows={18}
            className="font-mono text-sm"
            placeholder={"# Heading\n\nWrite your article in Markdown…"}
            aria-invalid={!!form.formState.errors.content}
            {...form.register("content")}
          />
        ) : (
          <div className="min-h-96 rounded-lg border p-6">
            {content.trim() ? (
              <Markdown content={content} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing to preview yet.
              </p>
            )}
          </div>
        )}
        {form.formState.errors.content && (
          <p className="text-destructive text-sm" role="alert">
            {form.formState.errors.content.message}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          {article ? "Save changes" : "Create draft"}
        </Button>

        {article && (
          <>
            <Button
              type="button"
              variant={article.isPublished ? "outline" : "secondary"}
              disabled={update.isPending}
              onClick={togglePublish}
            >
              {article.isPublished ? (
                <>
                  <GlobeLock className="size-4" aria-hidden /> Unpublish
                </>
              ) : (
                <>
                  <Globe className="size-4" aria-hidden /> Publish
                </>
              )}
            </Button>
            <Badge variant={article.isPublished ? "default" : "secondary"}>
              {article.isPublished ? "Published" : "Draft"}
            </Badge>
            <span className="text-muted-foreground text-xs">
              /help/{article.slug}
            </span>
          </>
        )}
      </div>
    </form>
  );
}
