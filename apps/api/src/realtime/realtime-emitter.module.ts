import { Module } from '@nestjs/common';
import { RealtimeEmitterService } from './realtime-emitter.service';

/**
 * Standalone on purpose: it imports nothing, so business modules and
 * RealtimeModule can both depend on it without forming a cycle.
 */
@Module({
  providers: [RealtimeEmitterService],
  exports: [RealtimeEmitterService],
})
export class RealtimeEmitterModule {}
