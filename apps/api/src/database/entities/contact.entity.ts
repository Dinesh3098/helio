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
 * An end customer of a workspace. Email is nullable because anonymous
 * chat-widget visitors become contacts before they identify themselves.
 */
@Entity('contacts')
@Index(['workspaceId', 'email'])
@Index(['workspaceId', 'visitorId'], {
  unique: true,
  where: '"visitor_id" IS NOT NULL',
})
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  /**
   * Anonymous chat-widget identity: a UUID minted by the widget and kept
   * in the visitor's localStorage. Unique per workspace so the same
   * browser maps to exactly one contact. Null for contacts that arrived
   * through other channels.
   */
  @Column({ name: 'visitor_id', type: 'uuid', nullable: true })
  visitorId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
