import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FOTF Studios",
    short_name: "FOTF",
    description:
      "Sala de ensayo de DJ por hora en Viña del Mar. Aislada acústicamente, equipo Pioneer y monitores de estudio.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "es-CL",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
