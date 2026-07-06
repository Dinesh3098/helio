import { MessageResponseDto } from "../../messages/dto/message-response.dto";

/** Shared transcript rendering so every prompt sees the same format. */
export function formatTranscript(messages: MessageResponseDto[]): string {
  return messages
    .map((message) => {
      const speaker =
        message.senderType === "CONTACT"
          ? `Customer (${message.senderName ?? "unknown"})`
          : `Agent (${message.senderName ?? "system"})`;
      return `${speaker}: ${message.content}`;
    })
    .join("\n");
}
