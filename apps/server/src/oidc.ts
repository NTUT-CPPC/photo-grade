import * as oidc from "openid-client";
import { env } from "./env.js";

let configCache: Promise<oidc.Configuration> | null = null;

export function defaultRedirectUri(): string {
  if (env.OIDC_REDIRECT_URI) return env.OIDC_REDIRECT_URI;
  const base = (env.APP_BASE_URL || `http://localhost:${env.PORT}`).replace(/\/+$/, "");
  return `${base}/auth/callback`;
}

export async function oidcConfig(): Promise<oidc.Configuration> {
  if (!env.OIDC_ISSUER_URL || !env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET) {
    throw new Error("OIDC environment variables are not configured.");
  }
  if (!configCache) {
    configCache = oidc.discovery(
      new URL(env.OIDC_ISSUER_URL),
      env.OIDC_CLIENT_ID,
      env.OIDC_CLIENT_SECRET
    );
  }
  return configCache;
}

export async function buildAuthorizationUrl(params: {
  state: string;
  codeChallenge: string;
  nonce?: string;
}): Promise<URL> {
  const config = await oidcConfig();
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: defaultRedirectUri(),
    scope: env.OIDC_SCOPES,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    state: params.state,
    ...(params.nonce ? { nonce: params.nonce } : {})
  });
  return url;
}

export async function exchangeCallback(currentUrl: URL, expected: { state: string; codeVerifier: string; nonce?: string }) {
  const config = await oidcConfig();
  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: expected.codeVerifier,
    expectedState: expected.state,
    ...(expected.nonce ? { expectedNonce: expected.nonce } : {})
  });
  const claims = tokens.claims();
  return { tokens, claims };
}

export async function buildEndSessionUrl(idToken: string | undefined): Promise<URL | null> {
  const config = await oidcConfig();
  const meta = config.serverMetadata();
  if (!meta.end_session_endpoint) return null;
  const url = oidc.buildEndSessionUrl(config, {
    ...(idToken ? { id_token_hint: idToken } : {}),
    ...(env.OIDC_POST_LOGOUT_REDIRECT_URI ? { post_logout_redirect_uri: env.OIDC_POST_LOGOUT_REDIRECT_URI } : {})
  });
  return url;
}

export const pkce = {
  randomState: oidc.randomState,
  randomCodeVerifier: oidc.randomPKCECodeVerifier,
  calculateCodeChallenge: oidc.calculatePKCECodeChallenge,
  randomNonce: oidc.randomNonce
};
