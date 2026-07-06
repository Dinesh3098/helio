"use client";

import { useCallback, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { getApiErrorMessage } from "@/lib/api/client";
import type { UploadedAttachment } from "@/types/api";
import { attachmentsApi } from "./api";

export interface PendingUpload {
  /** Client-side identity, stable across retries. */
  localId: string;
  file: File;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  /** Set once uploaded — what gets sent with the message. */
  attachmentId?: string;
  /** Object URL preview for images, from the local File. */
  previewUrl?: string;
}

/**
 * Composer upload queue: files upload immediately on selection with
 * per-file progress, cancel, retry, and remove. `takeReadyIds()` hands
 * the finished ids to the send path and clears the tray.
 */
export function useUploadManager(conversationId?: string) {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const controllersRef = useRef(new Map<string, AbortController>());

  const patch = useCallback(
    (localId: string, changes: Partial<PendingUpload>) => {
      setUploads((current) =>
        current.map((u) => (u.localId === localId ? { ...u, ...changes } : u)),
      );
    },
    [],
  );

  const startUpload = useCallback(
    (localId: string, file: File) => {
      const controller = new AbortController();
      controllersRef.current.set(localId, controller);
      patch(localId, { status: "uploading", progress: 0, error: undefined });

      attachmentsApi
        .upload({
          file,
          conversationId,
          signal: controller.signal,
          onProgress: (fraction) => patch(localId, { progress: fraction }),
        })
        .then((attachment: UploadedAttachment) => {
          patch(localId, {
            status: "done",
            progress: 1,
            attachmentId: attachment.id,
          });
        })
        .catch((error: unknown) => {
          // Cancel is not an error state — the row was already removed.
          if (isAxiosError(error) && error.code === "ERR_CANCELED") return;
          patch(localId, {
            status: "error",
            error: getApiErrorMessage(error),
          });
        })
        .finally(() => controllersRef.current.delete(localId));
    },
    [conversationId, patch],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setUploads((current) => [
          ...current,
          {
            localId,
            file,
            progress: 0,
            status: "uploading",
            previewUrl: file.type.startsWith("image/")
              ? URL.createObjectURL(file)
              : undefined,
          },
        ]);
        startUpload(localId, file);
      }
    },
    [startUpload],
  );

  const remove = useCallback((localId: string) => {
    controllersRef.current.get(localId)?.abort();
    controllersRef.current.delete(localId);
    setUploads((current) => {
      const target = current.find((u) => u.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      // Already-uploaded but unsent files are deleted server-side too.
      if (target?.attachmentId) {
        void attachmentsApi.remove(target.attachmentId).catch(() => undefined);
      }
      return current.filter((u) => u.localId !== localId);
    });
  }, []);

  const retry = useCallback(
    (localId: string) => {
      const target = uploads.find((u) => u.localId === localId);
      if (target && target.status === "error") {
        startUpload(localId, target.file);
      }
    },
    [startUpload, uploads],
  );

  const clear = useCallback(() => {
    setUploads((current) => {
      current.forEach((u) => {
        if (u.previewUrl) URL.revokeObjectURL(u.previewUrl);
      });
      return [];
    });
  }, []);

  const readyIds = uploads
    .filter((u) => u.status === "done" && u.attachmentId)
    .map((u) => u.attachmentId as string);
  const busy = uploads.some((u) => u.status === "uploading");

  return { uploads, addFiles, remove, retry, clear, readyIds, busy };
}
