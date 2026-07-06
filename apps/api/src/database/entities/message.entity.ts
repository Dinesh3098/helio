import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Conversation } from "./conversation.entity";

export enum MessageSenderType {
  CONTACT = "CONTACT",
  USER = "USER",
}

export enum MessageType {
  TEXT = "TEXT",
  SYSTEM = "SYSTEM",
}

/**
 * Attachment summary embedded in message metadata. `id` references an
 * Attachment row (download via /attachments/:id/download); email-inbound
 * entries may carry only metadata (no stored object, id absent).
 */
export interface MessageAttachment {
  id?: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;
}

/**
 * Channel-specific extras. Chat messages leave this null; email messages
 * carry their envelope here so the Message row itself stays channel-
 * agnostic.
 */
export interface MessageMetadata {
  /** Files uploaded and sent with this (chat) message. */
  attachments?: MessageAttachment[];
  email?: {
    subject: string | null;
    from: string;
    to: string;
    messageId: string | null;
    html: string | null;
    attachments: MessageAttachment[];
  };
}

/**
 * Immutable message rows (no updated_at). The sender is polymorphic
 * (contact or user), so sender_id intentionally has no foreign key —
 * integrity is enforced at the application layer. It is nullable for
 * SYSTEM messages, which have no sender.
 */
@Entity("messages")
@Index(["conversationId", "createdAt"])
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "conversation_id", type: "uuid" })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation: Conversation;

  @Column({
    name: "sender_type",
    type: "enum",
    enum: MessageSenderType,
    enumName: "message_sender_type",
  })
  senderType: MessageSenderType;

  @Column({ name: "sender_id", type: "uuid", nullable: true })
  senderId: string | null;

  @Column({ type: "text" })
  content: string;

  @Column({
    name: "message_type",
    type: "enum",
    enum: MessageType,
    enumName: "message_type",
    default: MessageType.TEXT,
  })
  messageType: MessageType;

  @Column({ name: "is_read", type: "boolean", default: false })
  isRead: boolean;

  @Column({ type: "jsonb", nullable: true })
  metadata: MessageMetadata | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
