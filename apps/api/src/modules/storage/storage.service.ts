import {
  BadRequestException,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { AppConfig } from '../../config/configuration';
import { StorageProviderError } from './errors/storage-provider.error';
import {
  ObjectDownload,
  STORAGE_PROVIDER,
  type StorageProvider,
} from './providers/storage-provider.interface';

/**
 * Allowlist, not blocklist: images + common documents only. Everything
 * else — executables above all — is rejected at 415 before any byte
 * reaches a provider.
 */
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

/** Extensions that must never pass, whatever mime type is claimed. */
const FORBIDDEN_EXTENSIONS = new Set([
  'exe', 'dll', 'bat', 'cmd', 'sh', 'bash', 'zsh', 'com', 'scr', 'msi',
  'js', 'mjs', 'cjs', 'vbs', 'ps1', 'php', 'py', 'rb', 'pl', 'jar', 'app',
  'dmg', 'html', 'htm', 'svg',
]);

export interface StoreFileInput {
  workspaceId: string;
  body: Readable;
  originalFilename: string;
  mimeType: string;
  size: number;
}

export interface StoredFile {
  storageKey: string;
  provider: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
}

/**
 * The only door to object storage. Validates (type/size/filename),
 * generates opaque workspace-scoped keys, delegates bytes to the injected
 * provider, and maps every provider failure onto an HTTP error — a
 * storage outage surfaces as 503 on attachment routes and touches nothing
 * else in the platform.
 */
@Injectable()
export class StorageService {
  private readonly maxFileSizeBytes: number;

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider,
    config: ConfigService<AppConfig, true>,
  ) {
    this.maxFileSizeBytes =
      config.get('storage.maxFileSizeMb', { infer: true }) * 1024 * 1024;
  }

  get providerName(): string {
    return this.provider.name;
  }

  get maxFileSize(): number {
    return this.maxFileSizeBytes;
  }

  validate(originalFilename: string, mimeType: string, size: number): void {
    if (size > this.maxFileSizeBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the ${Math.round(this.maxFileSizeBytes / 1024 / 1024)} MB limit`,
      );
    }
    if (size <= 0) {
      throw new BadRequestException('File is empty');
    }
    if (!ALLOWED_MIME_TYPES[mimeType]) {
      throw new UnsupportedMediaTypeException(
        'Only PNG, JPEG, GIF, WEBP, PDF, DOC, DOCX, TXT, and CSV files are supported',
      );
    }
    const extension = originalFilename.split('.').pop()?.toLowerCase() ?? '';
    if (FORBIDDEN_EXTENSIONS.has(extension)) {
      throw new UnsupportedMediaTypeException(
        'This file type is not allowed',
      );
    }
  }

  async store(input: StoreFileInput): Promise<StoredFile> {
    this.validate(input.originalFilename, input.mimeType, input.size);

    const filename = this.sanitizeFilename(
      input.originalFilename,
      input.mimeType,
    );
    // Opaque, collision-free, workspace-prefixed — client input never
    // reaches the key, so path traversal is structurally impossible.
    const storageKey = `${input.workspaceId}/${randomUUID()}.${ALLOWED_MIME_TYPES[input.mimeType]}`;

    try {
      await this.provider.put({
        key: storageKey,
        body: input.body,
        contentType: input.mimeType,
        contentLength: input.size,
      });
    } catch (error) {
      throw this.mapError(error);
    }

    return {
      storageKey,
      provider: this.provider.name,
      filename,
      originalFilename: input.originalFilename.slice(0, 255),
      mimeType: input.mimeType,
      size: input.size,
    };
  }

  async getDownload(
    storageKey: string,
    downloadFilename: string,
  ): Promise<ObjectDownload> {
    try {
      return await this.provider.getDownload(storageKey, downloadFilename);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await this.provider.delete(storageKey);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /** ASCII-safe, header-safe display name; extension kept for the OS. */
  sanitizeFilename(originalFilename: string, mimeType: string): string {
    const base = originalFilename
      .replace(/\.[^.]*$/, '')
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .trim()
      .slice(0, 100);
    return `${base || 'file'}.${ALLOWED_MIME_TYPES[mimeType] ?? 'bin'}`;
  }

  private mapError(error: unknown): Error {
    if (error instanceof StorageProviderError) {
      switch (error.reason) {
        case 'timeout':
          return new GatewayTimeoutException(
            'Storage service temporarily unavailable',
          );
        case 'not_found':
          return new NotFoundException('File not found in storage');
        case 'permission':
        case 'unavailable':
          return new ServiceUnavailableException(
            'Storage service temporarily unavailable',
          );
      }
    }
    return new ServiceUnavailableException(
      'Storage service temporarily unavailable',
    );
  }
}
