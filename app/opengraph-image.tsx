import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "FOTF Studios — Sala de ensayo de DJ por hora en Viña del Mar";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    photo: "photos/hero-booth.JPG",
    lines: ["Sala lista,", "tú también."],
    fontSize: 132,
    footLeft: "SALA DE ENSAYO DE DJ · POR HORA · VIÑA DEL MAR",
  });
}
