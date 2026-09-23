import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "Guía de iniciación al DJing gratis (PDF) — FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  // Recorte propio de 1200×630: satori no aplica la rotación EXIF, y encuadrar nosotros
  // elimina el problema de raíz además de bajar el peso del build.
  return ogImage({
    photo: "og/guia-dj.jpg",
    lines: ["Guía de iniciación", "al DJing · gratis"],
    footLeft: "PDF · 8 PÁGINAS · TE LLEGA AL CORREO",
  });
}
