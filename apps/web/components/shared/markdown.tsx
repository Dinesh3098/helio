import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Markdown renderer shared by the article editor preview and the public
 * help center. react-markdown never injects raw HTML, so user-authored
 * content is XSS-safe by construction. Memoized — the editor re-renders
 * on every keystroke, the preview only when content changes.
 */
export const Markdown = memo(function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed",
        "[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:first:mt-0",
        "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:first:mt-0",
        "[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold",
        "[&_p]:my-3",
        "[&_a]:underline [&_a]:underline-offset-2",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:my-1",
        "[&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
        "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_pre]:bg-muted [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:p-2",
        "[&_hr]:my-6",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
});
