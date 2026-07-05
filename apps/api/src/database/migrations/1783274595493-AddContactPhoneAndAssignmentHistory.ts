import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContactPhoneAndAssignmentHistory1783274595493 implements MigrationInterface {
    name = 'AddContactPhoneAndAssignmentHistory1783274595493'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "conversation_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "assigned_to_user_id" uuid, "assigned_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ab4027086b9efefe4f522288bed" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_caf43c5a2d0014523418843ec5" ON "conversation_assignments"  ("conversation_id") `);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "phone" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "conversation_assignments" ADD CONSTRAINT "FK_caf43c5a2d0014523418843ec5b" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation_assignments" ADD CONSTRAINT "FK_99dc7c9bdba44e8a41ab016838e" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversation_assignments" ADD CONSTRAINT "FK_9f47f5444245372831768c07a91" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "conversation_assignments" DROP CONSTRAINT "FK_9f47f5444245372831768c07a91"`);
        await queryRunner.query(`ALTER TABLE "conversation_assignments" DROP CONSTRAINT "FK_99dc7c9bdba44e8a41ab016838e"`);
        await queryRunner.query(`ALTER TABLE "conversation_assignments" DROP CONSTRAINT "FK_caf43c5a2d0014523418843ec5b"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "phone"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_caf43c5a2d0014523418843ec5"`);
        await queryRunner.query(`DROP TABLE "conversation_assignments"`);
    }

}
