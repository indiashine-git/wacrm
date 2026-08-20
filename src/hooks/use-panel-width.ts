"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Persists a resizable panel's width per user in profiles.panel_widths
 * (a JSON map keyed by panel id), not localStorage -- so a dragged
 * size survives logout and follows the user across devices/browsers.
 * Every resizable panel in the app (contact details, conversation
 * list, main nav) shares this one hook + one JSON column.
 */
export function usePanelWidth(panelKey: string, defaultWidth: number, min: number, max: number) {
  const [width, setWidth] = useState(defaultWidth);
  const userIdRef = useRef<string | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      userIdRef.current = user.id;
      const { data } = await supabase
        .from("profiles")
        .select("panel_widths")
        .eq("user_id", user.id)
        .maybeSingle();
      const widths = (data as { panel_widths?: Record<string, number> } | null)?.panel_widths;
      const saved = widths?.[panelKey];
      if (!cancelled && saved && saved >= min && saved <= max) setWidth(saved);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelKey]);

  const persist = useCallback(
    (next: number) => {
      if (!userIdRef.current) return;
      const supabase = createClient();
      supabase
        .from("profiles")
        .select("panel_widths")
        .eq("user_id", userIdRef.current)
        .maybeSingle()
        .then(({ data }) => {
          const current = (data as { panel_widths?: Record<string, number> } | null)?.panel_widths ?? {};
          return supabase
            .from("profiles")
            .update({ panel_widths: { ...current, [panelKey]: next } })
            .eq("user_id", userIdRef.current as string);
        });
    },
    [panelKey],
  );

  const clampedSetWidth = useCallback(
    (next: number) => setWidth(Math.min(max, Math.max(min, next))),
    [min, max],
  );

  return { width, setWidth: clampedSetWidth, persist, widthRef };
}
