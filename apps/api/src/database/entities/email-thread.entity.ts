import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

/**
 * RFC 5322 threading metadata linking an email conversation to its
 * headers. in_reply_to / references are null on the first email of a
 * thread. message_id_header is indexed because inbound email routing
 * looks threads up by it.
 */
@Entity('email_threads')
export class EmailThread {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @OneToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Index()
  @Column({ name: 'message_id_header', type: 'text' })
  messageIdHeader: string;

  @Column({ name: 'in_reply_to', type: 'text', nullable: true })
  inReplyTo: string | null;

  @Column({ type: 'text', nullable: true })
  references: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
