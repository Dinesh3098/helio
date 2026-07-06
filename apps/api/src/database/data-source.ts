import "reflect-metadata";
import * as path from "node:path";
import { config as loadEnv } from "dotenv";
import { DataSource } from "typeorm";
import { entities } from "./entities";

// CLI entry point for TypeORM migrations (the app itself configures the
// connection through DatabaseModule). Loads the repo-root .env.
loadEnv({
  path: [".env", path.resolve(__dirname, "../../../../.env")],
  quiet: true,
});

export default new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities,
  migrations: [path.join(__dirname, "migrations/*{.ts,.js}")],
  synchronize: false,
  logging: false,
});
