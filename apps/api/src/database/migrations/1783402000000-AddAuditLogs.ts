import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuditLogs1783402000000 implements MigrationInterface {
    name = 'AddAuditLogs1783402000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspace_id" uuid, "actor_user_id" uuid, "resource_type" character varying(64) NOT NULL, "resource_id" character varying(64), "action" character varying(128) NOT NULL, "metadata" jsonb, "ip_address" character varying(64), "user_agent" character varying(512), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_ws_created" ON "audit_logs" ("workspace_id", "created_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_ws_resource" ON "audit_logs" ("workspace_id", "resource_type", "resource_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_actor" ON "audit_logs" ("actor_user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_created" ON "audit_logs" ("created_at")`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_audit_logs_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_audit_logs_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_audit_logs_actor"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_audit_logs_workspace"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
