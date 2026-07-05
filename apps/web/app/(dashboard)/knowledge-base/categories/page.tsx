"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { CategoryManager } from "@/features/kb/components/category-manager";

export default function KbCategoriesPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/knowledge-base">
          <ArrowLeft className="size-4" aria-hidden />
          Back to articles
        </Link>
      </Button>
      <PageHeader
        title="Categories"
        description="Group articles into sections on your help center."
      />
      <CategoryManager />
    </div>
  );
}
