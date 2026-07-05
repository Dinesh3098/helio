import { z } from "zod";

export const workspaceSettingsSchema = z.object({
  name: z
    .string()
    .min(1, "Workspace name is required")
    .max(255, "Workspace name is too long"),
});

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: z.enum(["ADMIN", "AGENT"]),
});

export type WorkspaceSettingsValues = z.infer<typeof workspaceSettingsSchema>;
export type InviteMemberValues = z.infer<typeof inviteMemberSchema>;
