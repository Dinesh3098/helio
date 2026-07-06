import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AutomationRule } from "./automation-rule.entity";
import { Conversation } from "./conversation.entity";

export enum AutomationExecutionStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
}

/** One row per matched rule run — the automation audit trail. */
@Entity("automation_executions")
@Index(["ruleId", "startedAt"])
export class AutomationExecution {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "rule_id", type: "uuid" })
  ruleId: string;

  @ManyToOne(() => AutomationRule, { onDelete: "CASCADE" })
  @JoinColumn({ name: "rule_id" })
  rule: AutomationRule;

  @Index()
  @Column({ name: "conversation_id", type: "uuid" })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: "CASCADE" })
  @JoinColumn({ name: "conversation_id" })
  conversation: Conversation;

  @Column({
    type: "enum",
    enum: AutomationExecutionStatus,
    enumName: "automation_execution_status",
  })
  status: AutomationExecutionStatus;

  @Column({ type: "text", nullable: true })
  error: string | null;

  @CreateDateColumn({ name: "started_at", type: "timestamptz" })
  startedAt: Date;

  @Column({ name: "finished_at", type: "timestamptz", nullable: true })
  finishedAt: Date | null;
}
