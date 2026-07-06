import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHelpArticleAuthorsAndSearch1783365000000 implements MigrationInterface {
  name = "AddHelpArticleAuthorsAndSearch1783365000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "help_articles" ADD "excerpt" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "help_articles" ADD "created_by_user_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "help_articles" ADD "updated_by_user_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "help_articles" ADD CONSTRAINT "FK_help_articles_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "help_articles" ADD CONSTRAINT "FK_help_articles_updated_by" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // Weighted full-text search: title (A) > excerpt (B) > content (C).
    await queryRunner.query(
      `ALTER TABLE "help_articles" ADD "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', coalesce("excerpt", '')), 'B') || setweight(to_tsvector('english', "content"), 'C')) STORED`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_help_articles_search" ON "help_articles" USING GIN ("search_vector")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_help_articles_search"`);
    await queryRunner.query(
      `ALTER TABLE "help_articles" DROP COLUMN "search_vector"`,
    );
    await queryRunner.query(
      `ALTER TABLE "help_articles" DROP CONSTRAINT "FK_help_articles_updated_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "help_articles" DROP CONSTRAINT "FK_help_articles_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "help_articles" DROP COLUMN "updated_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "help_articles" DROP COLUMN "created_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "help_articles" DROP COLUMN "excerpt"`,
    );
  }
}
