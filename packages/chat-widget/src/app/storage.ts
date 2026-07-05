/**
 * Visitor identity: one UUID per workspace, minted on first visit and
 * kept in localStorage so refreshes and return visits map to the same
 * contact. Falls back to an in-memory id when storage is unavailable
 * (private browsing with storage disabled) — identity then lasts one page.
 */

let memoryFallback: string | null = null;

function storageKey(workspaceId: string): string {
  return `helio:visitor:${workspaceId}`;
}

function randomUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // RFC4122-ish fallback for very old browsers.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getOrCreateVisitorId(workspaceId: string): string {
  try {
    const key = storageKey(workspaceId);
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const visitorId = randomUuid();
    window.localStorage.setItem(key, visitorId);
    return visitorId;
  } catch {
    memoryFallback ??= randomUuid();
    return memoryFallback;
  }
}
