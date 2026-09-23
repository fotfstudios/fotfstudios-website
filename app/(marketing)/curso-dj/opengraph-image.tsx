import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "Curso de DJ en Viña del Mar — FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    photo: "photos/cabina-7.JPG",
    lines: ["Curso de DJ", "en Viña del Mar"],
    footLeft: "4 SESIONES · SET FINAL GRABADO · DESDE $79.990",
  });
}
