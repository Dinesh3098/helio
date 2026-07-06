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
import { Message } from "./message.entity";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

/**
 * One stored file. conversation_id/message_id are nullable because an
 * attachment is uploaded first and linked to a message on send; a row
 * that never gets linked simply expires from UI view (bytes remain until
 * deleted). uploaded_by_user_id is null for widget-visitor uploads.
 * storage_key is opaque and never leaves the API.
 */
@Entity("attachments")
export class Attachment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Index()
  @Column({ name: "conversation_id", type: "uuid", nullable: true })
  conversationId: string | null;

  @ManyToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation: Conversation | null;

  @Index()
  @Column({ name: "message_id", type: "uuid", nullable: true })
  messageId: string | null;

  @ManyToOne(() => Message, { onDelete: "SET NULL" })
  @JoinColumn({ name: "message_id" })
  message: Message | null;

  @Column({ name: "uploaded_by_user_id", type: "uuid", nullable: true })
  uploadedByUserId: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "uploaded_by_user_id" })
  uploadedByUser: User | null;

  @Column({ type: "varchar", length: 32 })
  provider: string;

  @Column({ name: "storage_key", type: "varchar", length: 255, unique: true })
  storageKey: string;

  /** Sanitized display name. */
  @Column({ type: "varchar", length: 255 })
  filename: string;

  @Column({ name: "original_filename", type: "varchar", length: 255 })
  originalFilename: string;

  @Column({ name: "mime_type", type: "varchar", length: 128 })
  mimeType: string;

  @Column({ type: "bigint" })
  size: number;

  @Column({ type: "varchar", length: 128, nullable: true })
  checksum: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
