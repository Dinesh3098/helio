import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

/** 4xx responses are definitive — retrying them only delays the error UI. */
function isClientError(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response !== undefined &&
    error.response.status < 500
  );
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          !isClientError(error) && failureCount < 2,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
