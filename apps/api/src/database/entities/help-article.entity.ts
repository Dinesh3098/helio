import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { HelpCategory } from './help-category.entity';
import { Workspace } from './workspace.entity';

/**
 * Public knowledge-base article. Slug is unique per workspace (it forms
 * the public URL). Carries workspace_id directly — resolving tenancy
 * through the category would cost a join on every public read.
 */
@Entity('help_articles')
@Unique(['workspaceId', 'slug'])
@Index(['workspaceId', 'isPublished'])
export class HelpArticle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Index()
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => HelpCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: HelpCategory;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
