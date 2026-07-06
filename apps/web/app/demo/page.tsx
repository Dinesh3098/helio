"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

declare global {
  interface Window {
    Helio?: {
      init: (options: {
        workspaceId: string;
        apiUrl: string;
        socketUrl?: string;
      }) => void;
    };
  }
}

const STORAGE_KEY = "helio-demo-workspace-id";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ENV_WORKSPACE_ID = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID ?? "";

/**
 * Theme toggle for the sample shop. Rendered after mount only — next-themes
 * resolves the stored/system theme on the client, so rendering the icon
 * during SSR would risk a hydration mismatch.
 */
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {mounted &&
        (resolvedTheme === "dark" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        ))}
    </button>
  );
}

/**
 * Standalone sample "customer website" for reviewers — a fictional
 * telescope shop (dark mode is night mode, as an astronomy store should
 * be). Workspace id is resolved in priority order: ?workspace=<id> URL
 * param → env default → last id used in this browser → manual input.
 * When one resolves, the widget loads automatically — reviewers open
 * /demo and just chat.
 */
function DemoContent() {
  const searchParams = useSearchParams();
  const urlWorkspaceId = searchParams.get("workspace") ?? "";

  const [workspaceId, setWorkspaceId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "active" | "error">(
    "idle",
  );
  const autoLoadedRef = useRef(false);

  const configured = urlWorkspaceId || ENV_WORKSPACE_ID;

  const loadWidget = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed || status === "loading" || status === "active") return;
    window.localStorage.setItem(STORAGE_KEY, trimmed);
    setStatus("loading");

    const script = document.createElement("script");
    script.src = "/widget.js";
    script.onload = () => {
      window.Helio?.init({ workspaceId: trimmed, apiUrl: API_URL });
      setStatus("active");
    };
    script.onerror = () => setStatus("error");
    document.body.appendChild(script);
  };

  // Auto-start when a workspace is configured; otherwise prefill the
  // input with the last id used in this browser.
  useEffect(() => {
    if (autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    if (configured) {
      setWorkspaceId(configured);
      loadWidget(configured);
    } else {
      setWorkspaceId(window.localStorage.getItem(STORAGE_KEY) ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  return (
    <div className="min-h-svh bg-white text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold tracking-tight">
            <span aria-hidden className="mr-1.5 text-indigo-500">
              ✦
            </span>
            Nightfall Optics
          </span>
          <div className="flex items-center gap-6">
            <nav className="hidden gap-6 text-sm text-slate-500 sm:flex dark:text-slate-400">
              <span>Telescopes</span>
              <span>Binoculars</span>
              <span>Star Maps</span>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            The night sky, delivered to your door.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-slate-500 dark:text-slate-400">
            This is a sample customer website used to demo the embedded Helio
            chat widget. Use the launcher in the bottom-right corner to chat,
            then answer from the Helio inbox in another tab.
          </p>
        </section>

        {status === "active" ? (
          <section className="mx-auto mb-16 max-w-xl rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-900 dark:bg-emerald-950">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Chat widget active — click the launcher in the bottom-right
              corner.
            </p>
          </section>
        ) : (
          <section className="mx-auto mb-16 max-w-xl rounded-xl border border-slate-200 p-6 shadow-sm dark:border-slate-800 dark:shadow-none">
            <h2 className="font-semibold">Helio widget demo</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {configured
                ? "Loading the widget…"
                : "No workspace configured. Paste a workspace ID (dashboard → Settings), or open /demo?workspace=<id>."}{" "}
              API: <code className="text-xs">{API_URL}</code>
            </p>
            {!configured && (
              <div className="mt-4 flex gap-2">
                <input
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  placeholder="Workspace ID (uuid)"
                  aria-label="Workspace ID"
                  className="h-10 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:focus:border-indigo-400 dark:focus:ring-indigo-900"
                />
                <button
                  type="button"
                  onClick={() => loadWidget(workspaceId)}
                  disabled={!workspaceId.trim() || status === "loading"}
                  className="h-10 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                >
                  {status === "loading" ? "Loading…" : "Load widget"}
                </button>
              </div>
            )}
            {status === "error" && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                Could not load /widget.js — run{" "}
                <code>pnpm --filter @helio/chat-widget build</code> first.
              </p>
            )}
          </section>
        )}

        <section className="grid gap-6 pb-24 sm:grid-cols-3">
          {[
            [
              "Star-ready in minutes",
              "Every scope ships assembled, collimated, and ready to point up.",
            ],
            [
              "Cloudy-nights guarantee",
              "30 nights to fall in love with it — or send it back.",
            ],
            [
              "Astronomers on call",
              "Real stargazers on chat, from sunset to sunrise.",
            ],
          ].map(([title, text]) => (
            <div
              key={title}
              className="rounded-xl border border-slate-200 p-6 dark:border-slate-800 dark:bg-slate-900/50"
            >
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {text}
              </p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

export default function DemoPage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <DemoContent />
    </Suspense>
  );
}
