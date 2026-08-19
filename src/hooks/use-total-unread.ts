"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/types";
import { useRealtime } from "@/hooks/use-realtime";

export interface UnreadSummary {
  /** Number of distinct conversations (customers) with unread messages. */
  conversationsWithUnread: number;
  /** Sum of unread_count across every conversation. */
  totalUnreadMessages: number;
}

/**
 * Unread summary for the current user, used by the sidebar to badge
 * the Inbox nav entry. Built on the shared `useRealtime` hook (not a
 * hand-rolled channel) so it gets the same zombie-channel rebuild
 * logic the inbox page relies on — this counter had the same silent
 * staleness bug as the inbox message feed before that fix (#312).
 */
export function useTotalUnread(): UnreadSummary {
  const [summary, setSummary] = useState<UnreadSummary>({
    conversationsWithUnread: 0,
    totalUnreadMessages: 0,
  });

  // Keep a live local mirror of {id: unread_count} so conversation
  // UPDATE/INSERT/DELETE events can recompute both totals in O(1)
  // without refetching.
  const countsRef = useRef<Map<string, number>>(new Map());

  function recompute() {
    let conversationsWithUnread = 0;
    let totalUnreadMessages = 0;
    for (const n of countsRef.current.values()) {
      if (n > 0) conversationsWithUnread += 1;
      totalUnreadMessages += n;
    }
    setSummary({ conversationsWithUnread, totalUnreadMessages });
  }

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // Initial load. RLS scopes this to the signed-in user automatically —
    // no explicit user_id filter needed here.
    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, unread_count");
      if (cancelled || error || !data) return;

      const map = new Map<string, number>();
      for (const row of data as { id: string; unread_count: number }[]) {
        map.set(row.id, row.unread_count ?? 0);
      }
      countsRef.current = map;
      recompute();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useRealtime({
    channelName: "total-unread-realtime",
    onConversationEvent: (event) => {
      if (event.eventType === "DELETE") {
        const oldRow = event.old as Partial<Conversation>;
        if (oldRow.id) countsRef.current.delete(oldRow.id);
      } else {
        const row = event.new as Conversation;
        countsRef.current.set(row.id, row.unread_count ?? 0);
      }
      recompute();
    },
    enabled: true,
  });

  return summary;
}
