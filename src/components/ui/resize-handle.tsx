"use client";

import { useCallback, useState } from "react";

/**
 * Drag handle for a resizable panel. `edge` is which side of the panel
 * the handle sits on -- "left" for a panel resized by dragging its
 * left border (grows when the pointer moves left), "right" for one
 * resized by its right border (grows when the pointer moves right).
 *
 * `getWidth` is read once at drag start, not on every move -- each
 * move computes the new width from that fixed starting point and the
 * pointer's total displacement, so the drag can't compound errors
 * frame over frame.
 */
export function ResizeHandle({
  edge,
  getWidth,
  onResize,
  onResizeEnd,
  label,
}: {
  edge: "left" | "right";
  getWidth: () => number;
  onResize: (newWidth: number) => void;
  onResizeEnd: (finalWidth: number) => void;
  label: string;
}) {
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      const startX = e.clientX;
      const startWidth = getWidth();
      let lastWidth = startWidth;

      function onMove(ev: PointerEvent) {
        const rawDelta = ev.clientX - startX;
        lastWidth = edge === "left" ? startWidth - rawDelta : startWidth + rawDelta;
        onResize(lastWidth);
      }
      function onUp() {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        onResizeEnd(lastWidth);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [edge, getWidth, onResize, onResizeEnd],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onPointerDown={handlePointerDown}
      className={`absolute inset-y-0 ${edge}-0 z-10 w-1.5 ${edge === "left" ? "-translate-x-1/2" : "translate-x-1/2"} cursor-col-resize touch-none hover:bg-primary/30 ${dragging ? "bg-primary/40" : ""}`}
    />
  );
}
