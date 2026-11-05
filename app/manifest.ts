import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dolemon — a private space for two",
    short_name: "Dolemon",
    description:
      "A private, invite-only space for one-to-one conversations. No groups, no noise. Calls connect phone to phone, encrypted.",
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
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
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
      {
        name: "Your brain",
        short_name: "Brain",
        url: "/app/brain",
      },
    ],
  };
}
