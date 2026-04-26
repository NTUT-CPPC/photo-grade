import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z
  .object({
    NODE_ENV: z.string().default("development"),
    PORT: z.coerce.number().default(8080),
    APP_BASE_URL: z.string().default("http://localhost:8080"),
    PUBLIC_ENTRY_URL: z.string().optional(),
    DATABASE_URL: z.string().default("postgresql://photo_grade:photo_grade@localhost:5432/photo_grade"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    DATA_DIR: z.string().default(path.resolve(process.cwd(), "data")),
    AUTH_MODE: z.enum(["basic", "oidc"]).default("basic"),
    AUTH_USERNAME: z.string().default("admin"),
    AUTH_PASSWORD: z.string().default("change-me"),
    SESSION_SECRET: z.string().optional(),
    COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
    OIDC_ISSUER_URL: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_CLIENT_SECRET: z.string().optional(),
    OIDC_REDIRECT_URI: z.string().optional(),
    OIDC_SCOPES: z.string().default("openid profile email"),
    OIDC_POST_LOGOUT_REDIRECT_URI: z.string().optional(),
    GOOGLE_SHEETS_ENABLED: z.coerce.boolean().default(false),
    GOOGLE_SHEET_ID: z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
    GOOGLE_SERVICE_ACCOUNT_FILE: z.string().optional(),
    MAX_IMPORT_FILE_MB: z.coerce.number().default(50),
    MAX_MEDIA_FILE_MB: z.coerce.number().default(200),
    SOCKET_CORS_ORIGIN: z.string().default("")
  })
  .superRefine((value, ctx) => {
    if (value.AUTH_MODE !== "oidc") return;
    const required: Array<keyof typeof value> = [
      "SESSION_SECRET",
      "OIDC_ISSUER_URL",
      "OIDC_CLIENT_ID",
      "OIDC_CLIENT_SECRET"
    ];
    for (const key of required) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when AUTH_MODE=oidc`
        });
      }
    }
  });

export const env = EnvSchema.parse(process.env);
