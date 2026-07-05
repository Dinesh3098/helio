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
import { User } from './user.entity';
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

  @Column({ type: 'varchar', length: 500, nullable: true })
  excerpt: string | null;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser: User | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_user_id' })
  updatedByUser: User | null;

  // A generated `search_vector` tsvector column exists on this table
  // (see the AddHelpArticleAuthorsAndSearch migration). It is deliberately
  // unmapped: TypeORM cannot express GENERATED ALWAYS tsvector columns,
  // and the search query references it raw.

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
