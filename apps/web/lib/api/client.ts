import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { tokenStore } from "@/lib/auth/token-store";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Endpoints where a 401 is a real answer, not an expired access token. */
const AUTH_PATHS = ["/auth/login", "/auth/signup", "/auth/refresh"];

export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Single-flight refresh: concurrent 401s share one refresh call so the
 * rotating refresh token is used exactly once.
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  refreshPromise ??= (async () => {
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) return false;
    try {
      // Bare axios: the api instance's interceptor must not recurse.
      const { data } = await axios.post<{
        accessToken: string;
        refreshToken: string;
      }>(`${BASE_URL}/auth/refresh`, { refreshToken });
      tokenStore.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      tokenStore.clear();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined;
    const isAuthPath = AUTH_PATHS.some((p) => config?.url?.includes(p));

    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !isAuthPath
    ) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        config._retried = true;
        return api(config);
      }
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  },
);

/** Extracts the NestJS error message ("message" is a string or string[]). */
export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] })
      ?.message;
    if (Array.isArray(message)) return message[0] ?? "Request failed";
    if (typeof message === "string") return message;
    if (error.code === "ERR_NETWORK") return "Cannot reach the server";
  }
  return "Something went wrong. Please try again.";
}
