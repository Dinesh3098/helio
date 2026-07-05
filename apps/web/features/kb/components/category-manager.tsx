"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FolderOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentMember } from "@/features/workspace/hooks";
import { getApiErrorMessage } from "@/lib/api/client";
import type { KbCategory } from "@/types/api";
import {
  useCreateCategory,
  useDeleteCategory,
  useKbCategories,
  useUpdateCategory,
} from "../hooks";
import { categorySchema, type CategoryValues } from "../schemas";

/** One dialog serves create and rename; `editing` decides the mutation. */
export function CategoryManager() {
  const categories = useKbCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const viewer = useCurrentMember();
  // Backend rule mirrored here: only OWNER/ADMIN may delete categories.
  const canDelete = viewer?.role === "OWNER" || viewer?.role === "ADMIN";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KbCategory | null>(null);
  const [toDelete, setToDelete] = useState<KbCategory | null>(null);

  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: "" },
  });
  const mutation = editing ? update : create;

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "" });
    create.reset();
    update.reset();
    setDialogOpen(true);
  };

  const openEdit = (category: KbCategory) => {
    setEditing(category);
    form.reset({ name: category.name });
    create.reset();
    update.reset();
    setDialogOpen(true);
  };

  const onSubmit = form.handleSubmit((values) => {
    const options = { onSuccess: () => setDialogOpen(false) };
    if (editing) {
      update.mutate({ id: editing.id, name: values.name }, options);
    } else {
      create.mutate(values, options);
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          New category
        </Button>
      </div>

      {categories.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={categories.refetch} />
      ) : categories.data.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No categories yet"
          description="Categories group your help articles on the public help center."
          action={<Button onClick={openCreate}>Create the first one</Button>}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Articles</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.data.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {category.publishedCount} published /{" "}
                      {category.articlesCount} total
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rename ${category.name}`}
                      onClick={() => openEdit(category)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${category.name}`}
                        onClick={() => setToDelete(category)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Rename category" : "New category"}
            </DialogTitle>
            <DialogDescription>
              Categories organize articles on your public help center.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {getApiErrorMessage(mutation.error)}
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                aria-invalid={!!form.formState.errors.name}
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-destructive text-sm" role="alert">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="animate-spin" />}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete category</DialogTitle>
            <DialogDescription>
              {toDelete
                ? toDelete.articlesCount > 0
                  ? `"${toDelete.name}" still has ${toDelete.articlesCount} article(s). Move or delete them first.`
                  : `"${toDelete.name}" will be permanently deleted.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending || (toDelete?.articlesCount ?? 0) > 0}
              onClick={() => {
                if (!toDelete) return;
                remove.mutate(toDelete.id, {
                  onSettled: () => setToDelete(null),
                });
              }}
            >
              {remove.isPending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
