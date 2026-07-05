"use client";

import { FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ArticlesTable } from "@/features/kb/components/articles-table";

export default function KnowledgeBasePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Knowledge Base"
        description="Help articles published to your public help center."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/knowledge-base/categories">
                <FolderOpen className="size-4" aria-hidden />
                Categories
              </Link>
            </Button>
            <Button asChild>
              <Link href="/knowledge-base/articles/new">
                <Plus className="size-4" aria-hidden />
                New article
              </Link>
            </Button>
          </div>
        }
      />
      <ArticlesTable />
    </div>
  );
}
