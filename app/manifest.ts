import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dolemon — a private space for two",
    short_name: "Dolemon",
    description:
      "A space for one-to-one conversations. No groups, no noise. Offline reading and encrypted live calls.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#09090B",
    theme_color: "#09090B",
    lang: "en",
    dir: "ltr",
    categories: ["social", "communication"],
    icons: [
      {
        src: "/icons/icon-192.png?v=2",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.png?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Your chats",
        short_name: "Chats",
        url: "/app",
      },
      {
        name: "Settings",
        short_name: "Settings",
        url: "/settings",
      },
    ],
  };
}
