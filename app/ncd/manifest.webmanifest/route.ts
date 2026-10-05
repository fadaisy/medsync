/** The NCD registry as an installable app (§9): opens on Today's clinic, scoped to /ncd. */
export function GET() {
  return Response.json(
    {
      name: "MedSync NCD registry",
      short_name: "NCD registry",
      start_url: "/ncd",
      scope: "/ncd",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#115e59",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
