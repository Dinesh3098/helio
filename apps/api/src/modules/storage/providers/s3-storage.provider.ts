import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../config/configuration';
import { StorageProviderError } from '../errors/storage-provider.error';
import {
  ObjectDownload,
  PutObjectInput,
  StorageProvider,
} from './storage-provider.interface';

const REQUEST_TIMEOUT_MS = 30_000;
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * AWS S3 via SDK v3. Uploads stream through @aws-sdk/lib-storage
 * (multipart under the hood — never a whole-file buffer); downloads are
 * pre-signed GET URLs so object bytes never proxy through the API.
 * All AWS knowledge (client, commands, error taxonomy) ends here.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  readonly name = 'S3';

  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private clientInstance: S3Client | null = null;

  constructor(config: ConfigService<AppConfig, true>) {
    const aws = config.get('storage.aws', { infer: true });
    this.bucket = aws.bucket;
    this.region = aws.region;
    this.accessKeyId = aws.accessKeyId;
    this.secretAccessKey = aws.secretAccessKey;
  }

  /**
   * Lazy: both providers are instantiated by the module regardless of
   * which is selected, and the SDK rejects an empty region at
   * construction — the client must not exist until S3 is actually used.
   */
  private get client(): S3Client {
    if (!this.clientInstance) {
      if (!this.region || !this.bucket) {
        throw new StorageProviderError(
          'unavailable',
          'S3 storage is not configured',
        );
      }
      this.clientInstance = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
        requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS },
      });
    }
    return this.clientInstance;
  }

  async put(input: PutObjectInput): Promise<void> {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
        },
      });
      await upload.done();
    } catch (error) {
      throw this.mapError(error, 'upload');
    }
  }

  async getDownload(
    key: string,
    downloadFilename: string,
  ): Promise<ObjectDownload> {
    try {
      const url = await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          // Filename travels in the signed URL, not from client input.
          ResponseContentDisposition: `attachment; filename="${downloadFilename}"`,
        }),
        { expiresIn: SIGNED_URL_TTL_SECONDS },
      );
      return { kind: 'url', url };
    } catch (error) {
      throw this.mapError(error, 'sign');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      throw this.mapError(error, 'delete');
    }
  }

  /**
   * Probes with a tiny PutObject to a fixed sentinel key — the exact
   * permission uploads need. HeadBucket/HeadObject would be cheaper but
   * require s3:ListBucket, which object-level IAM policies (like this
   * deployment's) typically do not grant.
   */
  async checkAvailability(): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: '.health/probe',
          Body: 'ok',
          ContentType: 'text/plain',
        }),
      );
    } catch (error) {
      throw this.mapError(error, 'health-probe');
    }
  }

  private mapError(error: unknown, operation: string): StorageProviderError {
    if (error instanceof StorageProviderError) return error;

    if (error instanceof S3ServiceException) {
      const name = error.name;
      this.logger.warn(`S3 ${operation} failed: ${name} — ${error.message}`);
      if (name === 'NoSuchKey' || name === 'NotFound') {
        return new StorageProviderError('not_found', 'Object not found');
      }
      if (
        name === 'AccessDenied' ||
        name === 'InvalidAccessKeyId' ||
        name === 'SignatureDoesNotMatch' ||
        name === 'ExpiredToken'
      ) {
        return new StorageProviderError(
          'permission',
          'Storage access denied',
        );
      }
      if (name === 'NoSuchBucket') {
        return new StorageProviderError(
          'unavailable',
          'Storage bucket is not available',
        );
      }
      return new StorageProviderError(
        'unavailable',
        'Storage service temporarily unavailable',
      );
    }

    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' ||
        error.name === 'AbortError' ||
        error.message.includes('timeout'))
    ) {
      this.logger.warn(`S3 ${operation} timed out`);
      return new StorageProviderError('timeout', 'Storage request timed out');
    }

    this.logger.warn(
      `S3 ${operation} failed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
    return new StorageProviderError(
      'unavailable',
      'Storage service temporarily unavailable',
    );
  }
}
