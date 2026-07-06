import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity";
import { Workspace } from "./workspace.entity";

export enum AutomationTrigger {
  CONVERSATION_CREATED = "CONVERSATION_CREATED",
  MESSAGE_RECEIVED = "MESSAGE_RECEIVED",
  MESSAGE_SENT = "MESSAGE_SENT",
  CONVERSATION_RESOLVED = "CONVERSATION_RESOLVED",
  CONVERSATION_REOPENED = "CONVERSATION_REOPENED",
}

/**
 * Conditions/actions live as validated jsonb — their schemas evolve with
 * the engine, and a column per condition type would mean a migration per
 * feature. Shapes are typed and validated in the automation module.
 */
@Entity("automation_rules")
@Index(["workspaceId", "enabled", "trigger"])
export class AutomationRule {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "boolean", default: true })
  enabled: boolean;

  @Column({
    type: "enum",
    enum: AutomationTrigger,
    enumName: "automation_trigger",
  })
  trigger: AutomationTrigger;

  @Column({ type: "jsonb", default: () => "'[]'" })
  conditions: unknown[];

  @Column({ type: "jsonb", default: () => "'[]'" })
  actions: unknown[];

  @Column({ name: "created_by_user_id", type: "uuid", nullable: true })
  createdByUserId: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by_user_id" })
  createdByUser: User | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
