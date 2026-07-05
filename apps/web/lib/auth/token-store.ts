/**
 * Access token lives in memory only (gone on reload — the interceptor
 * transparently re-acquires one via the refresh token). The refresh token
 * persists in localStorage for session persistence; the backend stores
 * only its hash and rotates it on every use, so a leaked value dies on
 * first legitimate refresh.
 */
const REFRESH_TOKEN_KEY = "helio.refresh-token";

let accessToken: string | null = null;

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  setTokens(access: string, refresh: string): void {
    accessToken = access;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    }
  },

  clear(): void {
    accessToken = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  },
};
