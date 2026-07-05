import { Zap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center p-4">
      <div className="mb-6 flex items-center gap-2">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
          <Zap className="size-4" aria-hidden />
        </div>
        <span className="text-xl font-semibold tracking-tight">Helio</span>
      </div>
      {children}
    </div>
  );
}
