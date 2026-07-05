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
import { Workspace } from './workspace.entity';

/**
 * An email address a workspace sends/receives through. Globally unique —
 * one mailbox cannot feed two workspaces. Provider stays a varchar (only
 * Resend today; an enum would force a migration per provider).
 */
@Entity('email_accounts')
export class EmailAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'display_name', type: 'varchar', length: 255, nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', length: 255 })
  provider: string;

  /** ACTIVE accounts send/receive; DISABLED ones are kept but inert. */
  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
