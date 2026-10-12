import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "Reserva la sala de ensayo DJ en Viña del Mar — FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    photo: "og/estudio.jpg",
    lines: ["Reserva tu hora", "en la cabina"],
    footLeft: "POR HORA · PAGO EN LÍNEA · VIÑA DEL MAR",
  });
}
