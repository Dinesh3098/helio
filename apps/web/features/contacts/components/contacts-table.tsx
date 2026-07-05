"use client";

import { formatDistanceToNow } from "date-fns";
import { Search, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { InitialsAvatar } from "@/components/shared/initials-avatar";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useContacts } from "../hooks";

const PAGE_LIMIT = 20;

export function ContactsTable() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search);

  const contacts = useContacts({ search: debouncedSearch, page });

  const onSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Search by name or email…"
          aria-label="Search contacts"
          className="pl-9"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {contacts.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : contacts.isError ? (
        <ErrorState error={contacts.error} onRetry={contacts.refetch} />
      ) : contacts.data.data.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={debouncedSearch ? "No matching contacts" : "No contacts yet"}
          description={
            debouncedSearch
              ? "Try a different name or email."
              : "Contacts are created automatically when customers reach out."
          }
        />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.data.data.map((contact) => (
                  <TableRow
                    key={contact.id}
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        router.push(`/contacts/${contact.id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <InitialsAvatar name={contact.name} />
                        <span className="font-medium">{contact.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDistanceToNow(new Date(contact.createdAt), {
                        addSuffix: true,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <PaginationControls
            page={page}
            total={contacts.data.total}
            limit={PAGE_LIMIT}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
