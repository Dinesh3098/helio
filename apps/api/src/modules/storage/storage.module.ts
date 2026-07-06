import { Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { STORAGE_PROVIDER } from './providers/storage-provider.interface';
import { StorageService } from './storage.service';

/**
 * Provider selection is pure configuration: STORAGE_PROVIDER=s3|local.
 * Same pattern as AI_PROVIDER / EMAIL_PROVIDER — business modules inject
 * StorageService and never learn which backend is running.
 */
const storageProviderFactory: Provider = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService, S3StorageProvider, LocalStorageProvider],
  useFactory: (
    config: ConfigService<AppConfig, true>,
    s3: S3StorageProvider,
    local: LocalStorageProvider,
  ) =>
    config.get('storage.provider', { infer: true }) === 's3' ? s3 : local,
};

@Module({
  providers: [
    S3StorageProvider,
    LocalStorageProvider,
    storageProviderFactory,
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
