"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MIN_WIDTH = 260;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 280;

/**
 * Drag-resizable wrapper around the inbox contact-details panel. Width
 * is persisted to profiles.contact_panel_width (per user, not
 * localStorage) so a dragged size survives logout and follows the
 * user across devices/browsers.
 */
export function ResizableContactPanel({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      userIdRef.current = user.id;
      const { data } = await supabase
        .from("profiles")
        .select("contact_panel_width")
        .eq("user_id", user.id)
        .maybeSingle();
      const saved = (data as { contact_panel_width?: number } | null)?.contact_panel_width;
      if (saved && saved >= MIN_WIDTH && saved <= MAX_WIDTH) setWidth(saved);
    }
    load();
  }, []);

  const persistWidth = useCallback((next: number) => {
    if (!userIdRef.current) return;
    createClient()
      .from("profiles")
      .update({ contact_panel_width: next })
      .eq("user_id", userIdRef.current)
      .then(() => {});
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const startWidth = widthRef.current;

      function onMove(ev: PointerEvent) {
        // Panel sits on the right edge, dragging its left border --
        // moving the pointer left (negative dx) grows the panel.
        const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - (ev.clientX - startX)));
        setWidth(next);
      }
      function onUp() {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        persistWidth(widthRef.current);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [persistWidth],
  );

  return (
    <div className="relative flex h-full shrink-0" style={{ width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize contact panel"
        onPointerDown={handlePointerDown}
        className={`absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none hover:bg-primary/30 ${dragging ? "bg-primary/40" : ""}`}
      />
      <div className="h-full w-full overflow-hidden">{children}</div>
    </div>
  );
}
