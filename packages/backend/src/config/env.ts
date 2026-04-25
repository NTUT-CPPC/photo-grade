import path from "node:path";

export type AuthRole = "host" | "score" | "admin";

export type BasicAuthCredential = {
  username: string;
  password: string;
};

export type BackendConfig = {
  nodeEnv: string;
  port: number;
  dataDir: string;
  databaseUrl: string;
  auth: Record<AuthRole, BasicAuthCredential>;
  storage: {
    photosDir: string;
    originalPhotosDir: string;
    derivativePhotosDir: string;
    importsDir: string;
    exportsDir: string;
    tempDir: string;
  };
};

type EnvSource = Record<string, string | undefined>;

export function loadBackendConfig(env: EnvSource = process.env): BackendConfig {
  const dataDir = path.resolve(env.DATA_DIR ?? "/data");

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: readPort(env.PORT),
    dataDir,
    databaseUrl: readRequiredEnv(env, "DATABASE_URL"),
    auth: {
      host: readCredential(env, "HOST_AUTH_USERNAME", "HOST_AUTH_PASSWORD", "HOST_USERNAME", "HOST_PASSWORD"),
      score: readCredential(env, "SCORE_AUTH_USERNAME", "SCORE_AUTH_PASSWORD", "SCORE_USERNAME", "SCORE_PASSWORD"),
      admin: readCredential(env, "ADMIN_AUTH_USERNAME", "ADMIN_AUTH_PASSWORD", "ADMIN_USERNAME", "ADMIN_PASSWORD")
    },
    storage: {
      photosDir: path.join(dataDir, "photos"),
      originalPhotosDir: path.join(dataDir, "photos", "originals"),
      derivativePhotosDir: path.join(dataDir, "photos", "derivatives"),
      importsDir: path.join(dataDir, "imports"),
      exportsDir: path.join(dataDir, "exports"),
      tempDir: path.join(dataDir, "tmp")
    }
  };
}

function readCredential(
  env: EnvSource,
  usernameKey: string,
  passwordKey: string,
  fallbackUsernameKey: string,
  fallbackPasswordKey: string
): BasicAuthCredential {
  return {
    username: readRequiredEnv(env, usernameKey, fallbackUsernameKey),
    password: readRequiredEnv(env, passwordKey, fallbackPasswordKey)
  };
}

function readRequiredEnv(env: EnvSource, key: string, fallbackKey?: string): string {
  const value = env[key] ?? (fallbackKey ? env[fallbackKey] : undefined);
  if (!value) {
    throw new Error(
      fallbackKey
        ? `Missing required environment variable ${key} or ${fallbackKey}.`
        : `Missing required environment variable ${key}.`
    );
  }

  return value;
}

function readPort(value: string | undefined): number {
  if (!value) {
    return 3000;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535. Received ${value}.`);
  }

  return port;
}
