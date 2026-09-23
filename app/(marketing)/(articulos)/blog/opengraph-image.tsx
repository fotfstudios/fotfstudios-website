import { OG_BLOG_PHOTO } from "@/lib/articles/og-photo";
import { ogImage, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt = "Artículos para DJs que están partiendo — FOTF Studios";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImage({
    photo: OG_BLOG_PHOTO,
    lines: ["Para DJs", "que están partiendo"],
    fontSize: 96,
    footLeft: "ARTÍCULOS · ESCRITOS EN LA SALA",
  });
}
