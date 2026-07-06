import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Baseline: the schema as it stood before the first incremental migration
 * (AddUserSessions). Earlier phases created these tables with
 * synchronize=true during development, so no migration existed for them —
 * which made it impossible to bootstrap a fresh database. Generated from
 * the entity definitions minus everything the 8 later migrations add,
 * and verified by comparing (baseline + all migrations) against the
 * entity schema.
 *
 * On databases provisioned before migrations were introduced the tables
 * already exist: the guard below records the baseline as applied without
 * touching anything.
 */
export class InitialSchema1783264000000 implements MigrationInterface {
  name = 'InitialSchema1783264000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('users')) {
      return;
    }
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public`);
    await queryRunner.query(`CREATE TYPE public.conversation_channel AS ENUM ( 'CHAT', 'EMAIL' )`);
    await queryRunner.query(`CREATE TYPE public.conversation_priority AS ENUM ( 'LOW', 'MEDIUM', 'HIGH' )`);
    await queryRunner.query(`CREATE TYPE public.conversation_status AS ENUM ( 'OPEN', 'SNOOZED', 'RESOLVED' )`);
    await queryRunner.query(`CREATE TYPE public.domain_ssl_status AS ENUM ( 'PENDING', 'ACTIVE', 'FAILED' )`);
    await queryRunner.query(`CREATE TYPE public.domain_verification_status AS ENUM ( 'PENDING', 'VERIFIED', 'FAILED' )`);
    await queryRunner.query(`CREATE TYPE public.message_sender_type AS ENUM ( 'CONTACT', 'USER' )`);
    await queryRunner.query(`CREATE TYPE public.message_type AS ENUM ( 'TEXT', 'SYSTEM' )`);
    await queryRunner.query(`CREATE TYPE public.workspace_member_role AS ENUM ( 'OWNER', 'ADMIN', 'AGENT' )`);
    await queryRunner.query(`CREATE TABLE public.contacts ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, workspace_id uuid NOT NULL, name character varying(255) NOT NULL, email character varying(255), created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.conversation_summaries ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, conversation_id uuid NOT NULL, summary text NOT NULL, model character varying(255) NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.conversations ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, workspace_id uuid NOT NULL, contact_id uuid NOT NULL, channel public.conversation_channel NOT NULL, status public.conversation_status DEFAULT 'OPEN'::public.conversation_status NOT NULL, priority public.conversation_priority DEFAULT 'MEDIUM'::public.conversation_priority NOT NULL, subject character varying(255), assigned_to_user_id uuid, assigned_at timestamp with time zone, last_message_preview text, last_message_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.custom_domains ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, workspace_id uuid NOT NULL, domain character varying(255) NOT NULL, verification_status public.domain_verification_status DEFAULT 'PENDING'::public.domain_verification_status NOT NULL, ssl_status public.domain_ssl_status DEFAULT 'PENDING'::public.domain_ssl_status NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.email_accounts ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, workspace_id uuid NOT NULL, email character varying(255) NOT NULL, provider character varying(255) NOT NULL, is_verified boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.email_threads ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, conversation_id uuid NOT NULL, message_id_header text NOT NULL, in_reply_to text, "references" text, created_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.help_articles ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, workspace_id uuid NOT NULL, category_id uuid NOT NULL, title character varying(255) NOT NULL, slug character varying(255) NOT NULL, content text NOT NULL, is_published boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.help_categories ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, workspace_id uuid NOT NULL, name character varying(255) NOT NULL, display_order integer DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.messages ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, conversation_id uuid NOT NULL, sender_type public.message_sender_type NOT NULL, sender_id uuid, content text NOT NULL, message_type public.message_type DEFAULT 'TEXT'::public.message_type NOT NULL, is_read boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.users ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, name character varying(255) NOT NULL, email character varying(255) NOT NULL, password_hash character varying(255) NOT NULL, is_active boolean DEFAULT true NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.workspace_members ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, workspace_id uuid NOT NULL, user_id uuid NOT NULL, role public.workspace_member_role NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`CREATE TABLE public.workspaces ( id uuid DEFAULT public.uuid_generate_v4() NOT NULL, name character varying(255) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL )`);
    await queryRunner.query(`ALTER TABLE ONLY public.workspaces ADD CONSTRAINT "PK_098656ae401f3e1a4586f47fd8e" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.messages ADD CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.email_threads ADD CONSTRAINT "PK_1f14199869568a456ff0bdc86a9" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.workspace_members ADD CONSTRAINT "PK_22ab43ac5865cd62769121d2bc4" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.conversation_summaries ADD CONSTRAINT "PK_2421821182990c781bf5fd1437c" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.help_categories ADD CONSTRAINT "PK_2d31cc840b31187d146e61912f3" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.custom_domains ADD CONSTRAINT "PK_53c30715082abb90e5063a2a397" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.users ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.help_articles ADD CONSTRAINT "PK_abcae2797feef660bbbbe20da78" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.contacts ADD CONSTRAINT "PK_b99cd40cfd66a99f1571f4f72e6" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.email_accounts ADD CONSTRAINT "PK_ba6b058deddd01dd99377a65ce0" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.conversations ADD CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY (id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.email_threads ADD CONSTRAINT "REL_bfa70ac18cca7d7e5658e359ae" UNIQUE (conversation_id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.conversation_summaries ADD CONSTRAINT "REL_c27f6a0b85703ac78b7db06c9c" UNIQUE (conversation_id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.help_categories ADD CONSTRAINT "UQ_0d1a5ddb084abf05d86dc4975e9" UNIQUE (workspace_id, name)`);
    await queryRunner.query(`ALTER TABLE ONLY public.workspace_members ADD CONSTRAINT "UQ_4896b609c71ca5ad20ad662077b" UNIQUE (workspace_id, user_id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.email_accounts ADD CONSTRAINT "UQ_7c1f94cd2f81a7bf31053a457d6" UNIQUE (email)`);
    await queryRunner.query(`ALTER TABLE ONLY public.users ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email)`);
    await queryRunner.query(`ALTER TABLE ONLY public.help_articles ADD CONSTRAINT "UQ_b593716cd1bc8cbe1ecf2cc9536" UNIQUE (workspace_id, slug)`);
    await queryRunner.query(`ALTER TABLE ONLY public.custom_domains ADD CONSTRAINT "UQ_e15fa3631ef1b306a4b4ec1d1b1" UNIQUE (domain)`);
    await queryRunner.query(`CREATE INDEX "IDX_051bc8679563082c27fe84712d" ON public.workspace_members USING btree (workspace_id, role)`);
    await queryRunner.query(`CREATE INDEX "IDX_37aee5a1b7b1ab5f21fa7cc283" ON public.contacts USING btree (workspace_id, email)`);
    await queryRunner.query(`CREATE INDEX "IDX_3e605129623b629ddd0583740d" ON public.conversations USING btree (contact_id)`);
    await queryRunner.query(`CREATE INDEX "IDX_40618402770cf3d5c75f4790f9" ON public.conversations USING btree (assigned_to_user_id)`);
    await queryRunner.query(`CREATE INDEX "IDX_4e83431119fa585fc7aa8b817d" ON public.workspace_members USING btree (user_id)`);
    await queryRunner.query(`CREATE INDEX "IDX_5a137dfe685d3e5ecc1f47d836" ON public.help_articles USING btree (workspace_id, is_published)`);
    await queryRunner.query(`CREATE INDEX "IDX_5af7a97281361bcf8259f3e91a" ON public.custom_domains USING btree (workspace_id)`);
    await queryRunner.query(`CREATE INDEX "IDX_671777769ed162b8730af8253b" ON public.conversations USING btree (workspace_id, status, last_message_at)`);
    await queryRunner.query(`CREATE INDEX "IDX_70b0dd0fc6dd26516cd5fa1b00" ON public.help_articles USING btree (category_id)`);
    await queryRunner.query(`CREATE INDEX "IDX_8584a1974e1ca95f4861d975ff" ON public.messages USING btree (conversation_id, created_at)`);
    await queryRunner.query(`CREATE INDEX "IDX_b2ffe45395c9e2173d44a2973e" ON public.conversations USING btree (workspace_id, assigned_to_user_id, status)`);
    await queryRunner.query(`CREATE INDEX "IDX_c53da5461dc03ed82e4a0b342a" ON public.email_threads USING btree (message_id_header)`);
    await queryRunner.query(`CREATE INDEX "IDX_c5ac4113a2444569de87366519" ON public.email_accounts USING btree (workspace_id)`);
    await queryRunner.query(`CREATE INDEX "IDX_f075a67c76462d622663fb1c19" ON public.conversations USING btree (workspace_id, contact_id)`);
    await queryRunner.query(`ALTER TABLE ONLY public.conversations ADD CONSTRAINT "FK_2136015a4b73fb4898773f2226f" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.messages ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.conversations ADD CONSTRAINT "FK_3e605129623b629ddd0583740db" FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.conversations ADD CONSTRAINT "FK_40618402770cf3d5c75f4790f99" FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id) ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE ONLY public.workspace_members ADD CONSTRAINT "FK_4a7c584ddfe855379598b5e20fd" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.workspace_members ADD CONSTRAINT "FK_4e83431119fa585fc7aa8b817db" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.custom_domains ADD CONSTRAINT "FK_5af7a97281361bcf8259f3e91a9" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.help_articles ADD CONSTRAINT "FK_70b0dd0fc6dd26516cd5fa1b005" FOREIGN KEY (category_id) REFERENCES public.help_categories(id) ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE ONLY public.help_categories ADD CONSTRAINT "FK_79d256a20d249a0f41fa08c32c4" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.help_articles ADD CONSTRAINT "FK_8f0c045169d8c4ca2d539820e1e" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.contacts ADD CONSTRAINT "FK_a65be64e40ceb2856e46cb9f8a8" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.email_threads ADD CONSTRAINT "FK_bfa70ac18cca7d7e5658e359ae9" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.conversation_summaries ADD CONSTRAINT "FK_c27f6a0b85703ac78b7db06c9c0" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE ONLY public.email_accounts ADD CONSTRAINT "FK_c5ac4113a2444569de873665191" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Inverse of up() — dropping the baseline empties the database.
    await queryRunner.query(`DROP TABLE IF EXISTS "email_threads" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email_accounts" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "custom_domains" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_summaries" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "help_articles" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "help_categories" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_members" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspaces" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.conversation_channel`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.conversation_priority`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.conversation_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.domain_ssl_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.domain_verification_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.message_sender_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.message_type`);
    await queryRunner.query(`DROP TYPE IF EXISTS public.workspace_member_role`);
  }
}
