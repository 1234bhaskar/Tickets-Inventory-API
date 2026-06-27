import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DIRECT_URL uses the session-mode pooler (port 5432) which supports
    // DDL statements required by Prisma Migrate. The transaction-mode pooler
    // (DATABASE_URL, port 6543, pgbouncer=true) does NOT support migrations.
    url: env("DIRECT_URL"),
  },
});
