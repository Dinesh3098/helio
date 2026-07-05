import { z } from "zod";

/**
 * Email/phone are optional on the backend but its validators reject empty
 * strings, so blank inputs are dropped from the PATCH body on submit.
 */
export const editContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  email: z.union([z.email("Enter a valid email address"), z.literal("")]),
  phone: z.string().max(50, "Phone is too long"),
});

export type EditContactValues = z.infer<typeof editContactSchema>;
