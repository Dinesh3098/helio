import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAutomationRules1783390000000 implements MigrationInterface {
  name = "AddAutomationRules1783390000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversations" ADD "tags" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."automation_trigger" AS ENUM('CONVERSATION_CREATED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'CONVERSATION_RESOLVED', 'CONVERSATION_REOPENED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."automation_execution_status" AS ENUM('SUCCESS', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "automation_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspace_id" uuid NOT NULL, "name" character varying(255) NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "trigger" "public"."automation_trigger" NOT NULL, "conditions" jsonb NOT NULL DEFAULT '[]', "actions" jsonb NOT NULL DEFAULT '[]', "created_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_automation_rules" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_rules_ws_enabled_trigger" ON "automation_rules" ("workspace_id", "enabled", "trigger")`,
    );
    await queryRunner.query(
      `CREATE TABLE "automation_executions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "rule_id" uuid NOT NULL, "conversation_id" uuid NOT NULL, "status" "public"."automation_execution_status" NOT NULL, "error" text, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "finished_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_automation_executions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_executions_rule_started" ON "automation_executions" ("rule_id", "started_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_automation_executions_conversation" ON "automation_executions" ("conversation_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_automation_rules_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_rules" ADD CONSTRAINT "FK_automation_rules_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_executions" ADD CONSTRAINT "FK_automation_executions_rule" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_executions" ADD CONSTRAINT "FK_automation_executions_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "automation_executions" DROP CONSTRAINT "FK_automation_executions_conversation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_executions" DROP CONSTRAINT "FK_automation_executions_rule"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_rules" DROP CONSTRAINT "FK_automation_rules_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "automation_rules" DROP CONSTRAINT "FK_automation_rules_workspace"`,
    );
    await queryRunner.query(`DROP TABLE "automation_executions"`);
    await queryRunner.query(`DROP TABLE "automation_rules"`);
    await queryRunner.query(`DROP TYPE "public"."automation_execution_status"`);
    await queryRunner.query(`DROP TYPE "public"."automation_trigger"`);
    await queryRunner.query(`ALTER TABLE "conversations" DROP COLUMN "tags"`);
  }
}
