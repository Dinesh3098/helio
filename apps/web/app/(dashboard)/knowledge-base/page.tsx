import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function KnowledgeBasePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Knowledge Base"
        description="Help articles for your customers."
      />
      <EmptyState
        icon={BookOpen}
        title="Coming soon"
        description="Categories, articles, and search arrive in a later milestone."
      />
    </div>
  );
}
