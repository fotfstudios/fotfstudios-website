"use client";

/** Reabre el banner de consentimiento (para cambiar de opinión desde el footer). */
export default function ConsentReopenLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("open-consent"))}
      className="label-sm text-bone-mute transition-colors hover:text-gold"
    >
      Preferencias de cookies
    </button>
  );
}
