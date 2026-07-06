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
import { Workspace } from "./workspace.entity";

export enum DomainVerificationStatus {
  PENDING = "PENDING",
  VERIFIED = "VERIFIED",
  FAILED = "FAILED",
}

export enum DomainSslStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  FAILED = "FAILED",
}

/**
 * Customer-owned domain serving the workspace's public surfaces.
 * Globally unique — DNS routing cannot map one domain to two tenants.
 */
@Entity("custom_domains")
export class CustomDomain {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "workspace_id", type: "uuid" })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: "CASCADE" })
  @JoinColumn({ name: "workspace_id" })
  workspace: Workspace;

  @Column({ type: "varchar", length: 255, unique: true })
  domain: string;

  @Column({
    name: "verification_status",
    type: "enum",
    enum: DomainVerificationStatus,
    enumName: "domain_verification_status",
    default: DomainVerificationStatus.PENDING,
  })
  verificationStatus: DomainVerificationStatus;

  @Column({
    name: "ssl_status",
    type: "enum",
    enum: DomainSslStatus,
    enumName: "domain_ssl_status",
    default: DomainSslStatus.PENDING,
  })
  sslStatus: DomainSslStatus;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
