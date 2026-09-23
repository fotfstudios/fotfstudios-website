import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "Guía de iniciación al DJing gratis (PDF) — FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  // Landscape nativa (sin rotación EXIF): satori no la aplica y la portada (cabina-11) sale de lado.
  return ogImage({
    photo: "photos/cabina-10.JPG",
    lines: ["Guía de iniciación", "al DJing · gratis"],
    footLeft: "PDF · 8 PÁGINAS · TE LLEGA AL CORREO",
  });
}
