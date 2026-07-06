import { Global, Module } from '@nestjs/common';
import { ConversationEventsService } from './conversation-events.service';

/**
 * Global: conversation events are emitted from many business modules
 * (messages, conversations, widget, email) — repeating the import in each
 * would be noise for a dependency-free service.
 */
@Global()
@Module({
  providers: [ConversationEventsService],
  exports: [ConversationEventsService],
})
export class ConversationEventsModule {}
