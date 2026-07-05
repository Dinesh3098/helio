"use client";

import { PageHeader } from "@/components/shared/page-header";
import { ContactsTable } from "@/features/contacts/components/contacts-table";

export default function ContactsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Contacts"
        description="Everyone who has reached out to your workspace."
      />
      <ContactsTable />
    </div>
  );
}
