import { CURSO } from "../_content";

/**
 * Slot for the student final-set video, swapped via CURSO.videoSrc in
 * _content.ts. While null it renders an honest "coming soon" frame — never a
 * fake thumbnail.
 */
export default function VideoSlot() {
  if (!CURSO.videoSrc) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 border border-dashed border-bone/25 bg-ink-soft/40 px-6 text-center">
        <span className="label text-gold">Set final · generación 01</span>
        <span className="label-sm max-w-sm leading-relaxed text-bone-mute">
          Aquí se publica el set grabado de la primera generación
        </span>
      </div>
    );
  }

  return (
    <video
      controls
      playsInline
      preload="metadata"
      poster={CURSO.videoPoster ?? undefined}
      aria-label="Set final grabado de un alumno del curso"
      className="aspect-video w-full border hairline bg-ink-soft"
    >
      <source src={CURSO.videoSrc} type="video/mp4" />
    </video>
  );
}
