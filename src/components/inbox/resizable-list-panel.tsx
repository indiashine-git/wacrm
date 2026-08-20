"use client";

import { usePanelWidth } from "@/hooks/use-panel-width";
import { ResizeHandle } from "@/components/ui/resize-handle";

const MIN_WIDTH = 260;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 320;

/** Drag-resizable wrapper around the inbox conversation list (desktop only -- mobile stays full-width). */
export function ResizableListPanel({ children }: { children: React.ReactNode }) {
  const { width, setWidth, persist, widthRef } = usePanelWidth(
    "conversationList",
    DEFAULT_WIDTH,
    MIN_WIDTH,
    MAX_WIDTH,
  );

  return (
    <div className="relative flex h-full shrink-0" style={{ width }}>
      <div className="h-full w-full overflow-hidden">{children}</div>
      <ResizeHandle
        edge="right"
        getWidth={() => widthRef.current}
        onResize={setWidth}
        onResizeEnd={() => persist(widthRef.current)}
        label="Resize conversation list"
      />
    </div>
  );
}
