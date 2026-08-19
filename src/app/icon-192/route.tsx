import { ImageResponse } from "next/og";

// Same brand mark as icon.tsx (the 32x32 favicon), rendered at PWA
// install size. Kept as a separate route rather than parametrizing
// icon.tsx because Next's special icon.tsx convention doesn't accept
// a size query param — manifest.ts references this URL directly.
export const runtime = "edge";
const SIZE = 192;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#7c3aed",
        }}
      >
        <svg
          width={SIZE * 0.6}
          height={SIZE * 0.6}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
