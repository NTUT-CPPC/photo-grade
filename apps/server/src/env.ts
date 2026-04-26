import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(8080),
  APP_BASE_URL: z.string().default("http://localhost:8080"),
  PUBLIC_ENTRY_URL: z.string().optional(),
  DATABASE_URL: z.string().default("postgresql://photo_grade:photo_grade@localhost:5432/photo_grade"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DATA_DIR: z.string().default(path.resolve(process.cwd(), "data")),
  AUTH_MODE: z.literal("basic").default("basic"),
  HOST_USERNAME: z.string().default("host"),
  HOST_PASSWORD: z.string().default("host"),
  SCORE_USERNAME: z.string().default("score"),
  SCORE_PASSWORD: z.string().default("score"),
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("admin"),
  GOOGLE_SHEETS_ENABLED: z.coerce.boolean().default(false),
  GOOGLE_SHEET_ID: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_FILE: z.string().optional(),
  MAX_IMPORT_FILE_MB: z.coerce.number().default(50),
  MAX_MEDIA_FILE_MB: z.coerce.number().default(200),
  SOCKET_CORS_ORIGIN: z.string().default("")
});

export const env = EnvSchema.parse(process.env);
