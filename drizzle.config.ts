import { defineConfig } from "drizzle-kit";
import { resolve } from "node:path";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: resolve("./db/dev.db"),
  },
});
