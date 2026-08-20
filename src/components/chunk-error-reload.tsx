"use client";

import { useEffect } from "react";

const RELOAD_FLAG = "watu-chunk-reload-at";
// Guard against a reload loop if the deploy itself is broken — only
// auto-reload once per 10s window.
const RELOAD_COOLDOWN_MS = 10_000;

function isChunkLoadError(message: string): boolean {
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message)
  );
}

function reloadOnce() {
  const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
  sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  window.location.reload();
}

/**
 * After a deploy, a tab that's been open across the old build can hold
 * a route reference to a JS chunk the new build no longer has. Next.js
 * surfaces this as a ChunkLoadError on the next soft navigation instead
 * of a normal page. A full reload always fixes it since it re-fetches
 * the current build's HTML/JS -- this just does that automatically
 * instead of leaving the user stuck on a blank/broken screen.
 */
export function ChunkErrorReload() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      if (isChunkLoadError(event.message || "")) reloadOnce();
    }
    function onRejection(event: PromiseRejectionEvent) {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
      if (isChunkLoadError(message)) reloadOnce();
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
