import type { MetadataRoute } from "next";

/**
 * Web app manifest (Next 16 metadata route; served at /manifest.webmanifest
 * and linked from every page automatically). Installable, standalone, opens
 * on the patient home. Colours are the tokens in `app/globals.css`:
 * `--background` and `--brand-800`, the deep teal. Icons are the brand
 * mark from `mobile/assets/images/icon.png`, resized once with sharp.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MedSync",
    short_name: "MedSync",
    description: "Ask your hospital for a day, or save your place in line.",
    start_url: "/patient",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#115e59",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
