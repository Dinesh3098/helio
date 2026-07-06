"use client";

import { FileText, Loader2, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatFileSize } from "../api";
import type { PendingUpload } from "../use-upload-manager";

/** Pending-upload chips above the composer: progress, retry, remove. */
export function UploadTray({
  uploads,
  onRemove,
  onRetry,
}: {
  uploads: PendingUpload[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}) {
  if (uploads.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t px-4 pt-3">
      {uploads.map((upload) => (
        <div
          key={upload.localId}
          className={cn(
            "bg-muted/50 relative flex items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 text-xs",
            upload.status === "error" && "border-destructive/50",
          )}
        >
          {/* Progress fill behind the chip content */}
          {upload.status === "uploading" && (
            <div
              className="bg-primary/10 absolute inset-y-0 left-0 transition-[width]"
              style={{ width: `${Math.round(upload.progress * 100)}%` }}
              aria-hidden
            />
          )}

          {upload.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={upload.previewUrl}
              alt=""
              className="relative size-8 rounded object-cover"
            />
          ) : (
            <FileText className="relative size-4 shrink-0" aria-hidden />
          )}

          <div className="relative min-w-0">
            <p className="max-w-40 truncate font-medium">{upload.file.name}</p>
            <p className="text-muted-foreground">
              {upload.status === "uploading" && (
                <span className="flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  {Math.round(upload.progress * 100)}%
                </span>
              )}
              {upload.status === "done" && formatFileSize(upload.file.size)}
              {upload.status === "error" && (
                <span className="text-destructive">{upload.error}</span>
              )}
            </p>
          </div>

          {upload.status === "error" && (
            <Button
              variant="ghost"
              size="icon"
              className="relative size-6"
              aria-label={`Retry ${upload.file.name}`}
              onClick={() => onRetry(upload.localId)}
            >
              <RotateCw className="size-3.5" aria-hidden />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="relative size-6"
            aria-label={
              upload.status === "uploading"
                ? `Cancel ${upload.file.name}`
                : `Remove ${upload.file.name}`
            }
            onClick={() => onRemove(upload.localId)}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  );
}
