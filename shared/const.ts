export const COOKIE_NAME = "__Host-session";
export const OAUTH_STATE_COOKIE = "__Host-oauth-state";
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const UNAUTHED_ERR_MSG = "UNAUTHORIZED";

export function encodeOAuthState(state: {
  redirectUri: string;
  nonce: string;
}): string {
  return btoa(JSON.stringify(state));
}

export function decodeOAuthState(encoded: string): {
  redirectUri: string;
  nonce: string;
} {
  return JSON.parse(atob(encoded));
}
