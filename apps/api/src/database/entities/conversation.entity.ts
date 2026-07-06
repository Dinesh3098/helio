import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contact } from './contact.entity';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

export enum ConversationChannel {
  CHAT = 'CHAT',
  EMAIL = 'EMAIL',
}

export enum ConversationStatus {
  OPEN = 'OPEN',
  SNOOZED = 'SNOOZED',
  RESOLVED = 'RESOLVED',
}

export enum ConversationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/**
 * A thread between one contact and a workspace on one channel. Holds only
 * the current assignee (no assignment history table by design) and
 * denormalized last-message fields so inbox lists never join messages.
 */
@Entity('conversations')
@Index(['workspaceId', 'status', 'lastMessageAt'])
@Index(['workspaceId', 'assignedToUserId', 'status'])
@Index(['workspaceId', 'contactId'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Index()
  @Column({ name: 'contact_id', type: 'uuid' })
  contactId: string;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @Column({
    type: 'enum',
    enum: ConversationChannel,
    enumName: 'conversation_channel',
  })
  channel: ConversationChannel;

  @Column({
    type: 'enum',
    enum: ConversationStatus,
    enumName: 'conversation_status',
    default: ConversationStatus.OPEN,
  })
  status: ConversationStatus;

  @Column({
    type: 'enum',
    enum: ConversationPriority,
    enumName: 'conversation_priority',
    default: ConversationPriority.MEDIUM,
  })
  priority: ConversationPriority;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject: string | null;

  @Index()
  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to_user_id' })
  assignedToUser: User | null;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  /** Free-form labels, managed by agents and automation rules. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ name: 'last_message_preview', type: 'text', nullable: true })
  lastMessagePreview: string | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
