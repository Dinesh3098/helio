import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAttachments1783414000000 implements MigrationInterface {
  name = "AddAttachments1783414000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspace_id" uuid NOT NULL, "conversation_id" uuid, "message_id" uuid, "uploaded_by_user_id" uuid, "provider" character varying(32) NOT NULL, "storage_key" character varying(255) NOT NULL, "filename" character varying(255) NOT NULL, "original_filename" character varying(255) NOT NULL, "mime_type" character varying(128) NOT NULL, "size" bigint NOT NULL, "checksum" character varying(128), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_attachments_storage_key" UNIQUE ("storage_key"), CONSTRAINT "PK_attachments" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_workspace" ON "attachments" ("workspace_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_conversation" ON "attachments" ("conversation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_message" ON "attachments" ("message_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_message" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" ADD CONSTRAINT "FK_attachments_uploader" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT "FK_attachments_uploader"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT "FK_attachments_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT "FK_attachments_conversation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attachments" DROP CONSTRAINT "FK_attachments_workspace"`,
    );
    await queryRunner.query(`DROP TABLE "attachments"`);
  }
}
