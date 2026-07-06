import { Module } from '@nestjs/common';
import { ConnectionRegistryService } from './connection-registry.service';
import { RealtimeEmitterService } from './realtime-emitter.service';

/**
 * Standalone on purpose: it imports nothing, so business modules,
 * RealtimeModule, and MetricsModule can all depend on it without forming
 * a cycle. The connection registry lives here (not in RealtimeModule) so
 * every consumer shares the single instance the gateway writes to.
 */
@Module({
  providers: [RealtimeEmitterService, ConnectionRegistryService],
  exports: [RealtimeEmitterService, ConnectionRegistryService],
})
export class RealtimeEmitterModule {}
