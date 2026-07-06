import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContactVisitorId1783359000000 implements MigrationInterface {
  name = "AddContactVisitorId1783359000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" ADD "visitor_id" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_contacts_workspace_visitor" ON "contacts" ("workspace_id", "visitor_id") WHERE "visitor_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_contacts_workspace_visitor"`,
    );
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "visitor_id"`);
  }
}
