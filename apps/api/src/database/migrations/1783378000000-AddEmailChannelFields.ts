import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailChannelFields1783378000000 implements MigrationInterface {
  name = "AddEmailChannelFields1783378000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "messages" ADD "metadata" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "email_accounts" ADD "display_name" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_accounts" ADD "status" character varying(32) NOT NULL DEFAULT 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_accounts" DROP COLUMN "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_accounts" DROP COLUMN "display_name"`,
    );
    await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "metadata"`);
  }
}
