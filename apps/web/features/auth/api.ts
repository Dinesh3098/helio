import { api } from "@/lib/api/client";
import type { AuthResponse, User } from "@/types/api";

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export const authApi = {
  signup: async (input: SignupInput) =>
    (await api.post<AuthResponse>("/auth/signup", input)).data,

  login: async (input: LoginInput) =>
    (await api.post<AuthResponse>("/auth/login", input)).data,

  logout: async (refreshToken: string) => {
    await api.post("/auth/logout", { refreshToken });
  },

  me: async () => (await api.get<User>("/auth/me")).data,
};
