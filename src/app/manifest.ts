import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Comunitaria",
    short_name: "Comunitaria",
    description:
      "SaaS multi-tenant para gestion de consorcios, barrios privados, reservas, reclamos y accesos.",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F4F6",
    theme_color: "#1E3A8A",
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}