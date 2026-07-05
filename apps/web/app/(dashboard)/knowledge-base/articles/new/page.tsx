"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ArticleEditor } from "@/features/kb/components/article-editor";

export default function NewArticlePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/knowledge-base">
          <ArrowLeft className="size-4" aria-hidden />
          Back to articles
        </Link>
      </Button>
      <PageHeader
        title="New article"
        description="Articles start as drafts — publish when ready."
      />
      <ArticleEditor article={null} />
    </div>
  );
}
