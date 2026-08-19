"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message, Conversation } from "@/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface RealtimeEvent<T> {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: T;
  old: Partial<T>;
}

interface UseRealtimeOptions {
  channelName: string;
  onMessageEvent?: (event: RealtimeEvent<Message>) => void;
  onConversationEvent?: (event: RealtimeEvent<Conversation>) => void;
  enabled?: boolean;
}

export function useRealtime({
  channelName,
  onMessageEvent,
  onConversationEvent,
  enabled = true,
}: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Store latest callbacks in refs to avoid re-subscribing when the
  // parent re-renders with fresh closures. Assigned inside an effect
  // so the mutation doesn't happen during render (React 19's refs
  // rule) — subscribers only read `.current` inside async Realtime
  // callbacks, which always run after the render that updates it.
  const onMessageRef = useRef(onMessageEvent);
  const onConversationRef = useRef(onConversationEvent);
  useEffect(() => {
    onMessageRef.current = onMessageEvent;
    onConversationRef.current = onConversationEvent;
  });

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    let cancelled = false;
    let currentChannel: RealtimeChannel | null = null;

    // Supabase Realtime's WS can go stale (idle-tab throttling, a
    // dropped connection the server never told the client about)
    // without the `.subscribe()` status callback ever moving off
    // "SUBSCRIBED" — `isConnected` stays true and events silently stop
    // arriving. Since sound/popup notifications and the live UI update
    // both key off these events, a zombie channel kills all three at
    // once with no visible sign anything's wrong (#312 — messages went
    // invisible for minutes on an actively-watched tab). Tearing the
    // channel down and recreating it periodically self-heals a zombie
    // connection instead of relying on a status transition that may
    // never come.
    function connect() {
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages" },
          (payload) => {
            onMessageRef.current?.({
              eventType: payload.eventType as RealtimeEvent<Message>["eventType"],
              new: payload.new as Message,
              old: payload.old as Partial<Message>,
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversations" },
          (payload) => {
            onConversationRef.current?.({
              eventType: payload.eventType as RealtimeEvent<Conversation>["eventType"],
              new: payload.new as Conversation,
              old: payload.old as Partial<Conversation>,
            });
          }
        )
        .subscribe((status) => {
          if (!cancelled) setIsConnected(status === "SUBSCRIBED");
        });

      currentChannel = channel;
      channelRef.current = channel;
    }

    function reconnect() {
      if (cancelled) return;
      if (currentChannel) supabase.removeChannel(currentChannel);
      // Force a false→true transition so the inbox page's own
      // reconnect-resync effect (which only fires on that transition)
      // still catches anything sent during the rebuild gap, even
      // though the old channel never reported itself as disconnected.
      setIsConnected(false);
      connect();
    }

    connect();

    // Hard periodic rebuild, regardless of visibility or reported
    // status — the "long unattended window" case the reconnect-on-
    // visibility-change path can't catch because the tab never goes
    // hidden.
    const rebuildInterval = setInterval(reconnect, 5 * 60 * 1000);

    // A tab coming back from background is the single most likely
    // place for the underlying WS to have gone stale (browsers
    // throttle/suspend background timers and sockets), so force a
    // rebuild there too rather than trusting the existing channel.
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconnect();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(rebuildInterval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (currentChannel) supabase.removeChannel(currentChannel);
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [channelName, enabled]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      const supabase = createClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
    }
  }, []);

  return { isConnected, unsubscribe };
}
