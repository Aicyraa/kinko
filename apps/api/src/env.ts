import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // Neon pooled connection — used at runtime by the Prisma adapter.
  DATABASE_URL: z.url("DATABASE_URL must be a valid Neon pooled connection string"),
  // Neon direct connection — used only by the Prisma CLI (migrations / Studio).
  DIRECT_URL: z.url("DIRECT_URL must be a valid Neon direct connection string").optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
