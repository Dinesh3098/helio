import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { AppConfig } from '../../../config/configuration';
import { StorageProviderError } from '../errors/storage-provider.error';
import {
  ObjectDownload,
  PutObjectInput,
  StorageProvider,
} from './storage-provider.interface';

/**
 * Filesystem-backed provider for development: files land under ./storage.
 * Selected with STORAGE_PROVIDER=local — no AWS credentials needed and no
 * application-code differences. Downloads stream back through the API
 * (there is no CDN to sign against).
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'LOCAL';

  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly rootDir: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.rootDir = resolve(
      process.cwd(),
      config.get('storage.localDir', { infer: true }),
    );
  }

  async put(input: PutObjectInput): Promise<void> {
    const target = this.safePath(input.key);
    try {
      await mkdir(dirname(target), { recursive: true });
      await pipeline(input.body, createWriteStream(target));
    } catch (error) {
      this.logger.warn(
        `local write failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new StorageProviderError(
        'unavailable',
        'Storage service temporarily unavailable',
      );
    }
  }

  getDownload(key: string): Promise<ObjectDownload> {
    const target = this.safePath(key);
    const stream = createReadStream(target);
    return new Promise((resolvePromise, rejectPromise) => {
      stream.once('open', () =>
        resolvePromise({ kind: 'stream', stream }),
      );
      stream.once('error', (error: NodeJS.ErrnoException) => {
        rejectPromise(
          error.code === 'ENOENT'
            ? new StorageProviderError('not_found', 'Object not found')
            : new StorageProviderError(
                'unavailable',
                'Storage service temporarily unavailable',
              ),
        );
      });
    });
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.safePath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new StorageProviderError(
        'unavailable',
        'Storage service temporarily unavailable',
      );
    }
  }

  /** Keys are server-generated, but never trust a path anyway. */
  private safePath(key: string): string {
    const target = normalize(join(this.rootDir, key));
    if (!target.startsWith(this.rootDir + sep)) {
      throw new StorageProviderError('not_found', 'Object not found');
    }
    return target;
  }
}
