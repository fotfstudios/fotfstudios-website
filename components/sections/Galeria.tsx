import { Section, SectionHead } from "../Section";
import Reveal from "../Reveal";
import GalleryClient from "../GalleryClient";
import { getPhotos, galleryPhotos, GALLERY_FEATURED_COUNT } from "@/lib/photos";

export default function Galeria() {
  const photos = galleryPhotos(getPhotos());
  if (photos.length === 0) return null; // sin fotos: la sección no aparece

  return (
    <div className="border-y hairline bg-ink-soft/40">
      <Section id="galeria">
        <SectionHead n="03" kicker="Galería" lines={["La sala,", "a oscuras."]} />
        <Reveal delay={120}>
          <p className="font-editorial mt-8 max-w-xl text-2xl leading-snug text-bone-dim">
            Negra por diseño. El equipo es el héroe.
          </p>
        </Reveal>
        <Reveal delay={80} className="mt-12">
          <GalleryClient photos={photos} featuredCount={GALLERY_FEATURED_COUNT} />
        </Reveal>
      </Section>
    </div>
  );
}
