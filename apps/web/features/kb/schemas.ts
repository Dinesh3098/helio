import { z } from "zod";

export const categorySchema = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(255, "Name is too long"),
});

export const articleSchema = z.object({
  title: z.string().min(1, "Title is required").max(255, "Title is too long"),
  categoryId: z.string().min(1, "Pick a category"),
  excerpt: z.string().max(500, "Excerpt is too long"),
  content: z.string().min(1, "Content is required"),
});

export type CategoryValues = z.infer<typeof categorySchema>;
export type ArticleValues = z.infer<typeof articleSchema>;
