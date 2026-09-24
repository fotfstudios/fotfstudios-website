import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "Cómo elegir tu pendrive para DJ: guía gratis (PDF) — FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    photo: "og/guia-pendrive-dj.jpg",
    lines: ["Tu pendrive", "para DJ"],
    footLeft: "GUÍA GRATIS · PDF · 8 CAPÍTULOS",
  });
}
