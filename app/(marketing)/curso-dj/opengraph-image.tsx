import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";
import { formatCLP } from "@/lib/pricing";
import { PRECIOS, PROGRAMA } from "@/lib/curso-content";

export const alt = "Curso de DJ en Viña del Mar — FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    photo: "og/curso-dj.jpg",
    lines: ["Curso de DJ", "en Viña del Mar"],
    footLeft: `${PROGRAMA.sesiones} SESIONES 1:1 · SET FINAL GRABADO · DESDE ${formatCLP(PRECIOS.duo)}`,
  });
}
