import { api } from "@/lib/api/client";
import type { UploadedAttachment } from "@/types/api";

export const attachmentsApi = {
  /** Multipart upload with progress + cancellation. */
  upload: async (input: {
    file: File;
    conversationId?: string;
    signal: AbortSignal;
    onProgress: (fraction: number) => void;
  }): Promise<UploadedAttachment> => {
    const form = new FormData();
    form.append("file", input.file);
    if (input.conversationId) {
      form.append("conversationId", input.conversationId);
    }
    const { data } = await api.post<UploadedAttachment>("/attachments", form, {
      signal: input.signal,
      onUploadProgress: (event) => {
        if (event.total) input.onProgress(event.loaded / event.total);
      },
    });
    return data;
  },

  remove: async (id: string) => {
    await api.delete(`/attachments/${id}`);
  },

  /** Bytes as an object URL (downloads need the auth header, so no <a href>). */
  fetchBlobUrl: async (id: string): Promise<string> => {
    const { data } = await api.get<Blob>(`/attachments/${id}/download`, {
      responseType: "blob",
    });
    return URL.createObjectURL(data);
  },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
