import type { MetadataRoute } from "next";

// Next.js auto-serves this at /manifest.webmanifest and injects the
// <link rel="manifest"> tag — no manual wiring needed in layout.tsx.
// Makes the app installable ("Add to Home Screen" / Chrome's install
// prompt) on top of the existing in-tab sound/popup alerting; this is
// NOT background push (notifications only fire while a tab is open
// somewhere) — that's a separate, bigger feature (service-worker push
// + subscription storage + a backend sender) if ever wanted later.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WATU",
    short_name: "WATU",
    description: "WhatsApp CRM by India-Shine.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    icons: [
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
