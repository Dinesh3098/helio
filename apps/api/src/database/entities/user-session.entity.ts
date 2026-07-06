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

/**
 * One row per issued refresh token — the database is the source of truth
 * for sessions. Only the SHA-256 hash of the token is stored (64 hex
 * chars); the hash is unique so lookup by presented token is O(1).
 * Rotation overwrites the hash; logout sets revoked_at.
 */
@Entity("user_sessions")
export class UserSession {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column({
    name: "refresh_token_hash",
    type: "varchar",
    length: 64,
    unique: true,
  })
  refreshTokenHash: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt: Date;

  @Column({ name: "revoked_at", type: "timestamptz", nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
