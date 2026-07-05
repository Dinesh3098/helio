"use client";

import { ConversationDetail } from "@/features/conversations/components/conversation-detail";
import { ConversationList } from "@/features/conversations/components/conversation-list";
import { useConversationRoom } from "@/features/conversations/realtime";
import { useUiStore } from "@/stores/ui-store";

export default function InboxPage() {
  const selectedId = useUiStore((s) => s.selectedConversationId);
  const selectConversation = useUiStore((s) => s.selectConversation);
  const { typingNames } = useConversationRoom(selectedId);

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r xl:w-96">
        <ConversationList
          selectedId={selectedId}
          onSelect={selectConversation}
        />
      </div>
      <div className="min-w-0 flex-1">
        <ConversationDetail id={selectedId} typingNames={typingNames} />
      </div>
    </div>
  );
}
