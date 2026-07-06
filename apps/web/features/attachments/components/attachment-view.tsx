"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/types/api";
import { attachmentsApi, formatFileSize } from "../api";

/**
 * Downloads require the auth header, so plain <a href> can't work: bytes
 * are fetched as a blob (cached by React Query) and served from an
 * object URL — inline for image previews, save-dialog for files.
 */
function useAttachmentBlob(attachmentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["attachments", attachmentId, "blob"],
    queryFn: () => attachmentsApi.fetchBlobUrl(attachmentId as string),
    enabled: enabled && !!attachmentId,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
}

export function AttachmentView({
  attachment,
  inverted,
}: {
  attachment: MessageAttachment;
  inverted: boolean;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const blob = useAttachmentBlob(attachment.id, isImage);

  const download = async () => {
    if (!attachment.id) return;
    const url =
      blob.data ?? (await attachmentsApi.fetchBlobUrl(attachment.id));
    const link = document.createElement("a");
    link.href = url;
    link.download = attachment.filename;
    link.click();
  };

  if (isImage && blob.data) {
    return (
      <button
        type="button"
        onClick={() => void download()}
        title={`Download ${attachment.filename}`}
        className="block overflow-hidden rounded-lg"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={blob.data}
          alt={attachment.filename}
          className="max-h-56 max-w-full rounded-lg object-contain"
        />
      </button>
    );
  }

  // Email-only metadata (no stored object) may carry an external URL.
  if (!attachment.id && attachment.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:underline",
          inverted
            ? "border-primary-foreground/25 text-primary-foreground/90"
            : "bg-background/60 text-foreground/80",
        )}
      >
        <FileText className="size-3.5" aria-hidden />
        {attachment.filename} ({formatFileSize(attachment.size)})
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={!attachment.id}
      onClick={() => void download()}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
        inverted
          ? "border-primary-foreground/25 text-primary-foreground/90 hover:bg-primary-foreground/10"
          : "bg-background/60 text-foreground/80 hover:bg-background",
        !attachment.id && "cursor-default opacity-70",
      )}
    >
      {isImage && blob.isFetching ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <FileText className="size-3.5" aria-hidden />
      )}
      <span className="max-w-48 truncate">{attachment.filename}</span>
      <span className="opacity-70">({formatFileSize(attachment.size)})</span>
      {attachment.id && <Download className="size-3" aria-hidden />}
    </button>
  );
}
