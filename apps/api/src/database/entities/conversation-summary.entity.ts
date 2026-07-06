import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Conversation } from "./conversation.entity";

/**
 * AI-generated summary, stored separately so AI failures never touch
 * conversation data. One row per conversation, overwritten on refresh
 * (hence updated_at only). The OneToOne join column enforces uniqueness.
 */
@Entity("conversation_summaries")
export class ConversationSummary {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "conversation_id", type: "uuid" })
  conversationId: string;

  @OneToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation: Conversation;

  @Column({ type: "text" })
  summary: string;

  @Column({ type: "varchar", length: 255 })
  model: string;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
