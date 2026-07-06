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
import { User } from "./user.entity";

/**
 * Append-only assignment history. The current assignee lives denormalized
 * on Conversation for fast inbox queries; this table answers "who handled
 * it and when". User FKs are SET NULL so history outlives accounts.
 */
@Entity("conversation_assignments")
export class ConversationAssignment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "conversation_id", type: "uuid" })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation: Conversation;

  @Column({ name: "assigned_to_user_id", type: "uuid", nullable: true })
  assignedToUserId: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "assigned_to_user_id" })
  assignedToUser: User | null;

  @Column({ name: "assigned_by_user_id", type: "uuid", nullable: true })
  assignedByUserId: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "assigned_by_user_id" })
  assignedByUser: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
