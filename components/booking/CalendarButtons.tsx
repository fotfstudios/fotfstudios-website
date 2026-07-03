"use client";

import { buildIcs, googleCalendarUrl } from "@/lib/ics";
import { SITE, SITE_URL } from "@/lib/site";

/**
 * "Agregar al calendario": descarga .ics (Blob, sin endpoint) + link a Google
 * Calendar prellenado. Solo se renderiza con fechas presentes y sesión futura
 * (lo decide el caller).
 */
export default function CalendarButtons({
  orderId,
  startsAt,
  endsAt,
  resourceName,
}: {
  orderId: string;
  startsAt: string;
  endsAt: string;
  resourceName: string | null;
}) {
  const summary = resourceName ? `FOTF Studios — ${resourceName}` : "FOTF Studios — Sesión";
  const description = "Coordinaremos tu acceso por WhatsApp antes de tu sesión.";

  const downloadIcs = () => {
    const ics = buildIcs({
      start: startsAt,
      end: endsAt,
      summary,
      description,
      location: SITE.address,
      uid: `fotf-${orderId}@fotfstudios.cl`,
      url: `${SITE_URL}/reserva/estado?b=${orderId}`,
    });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = "reserva-fotf-studios.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const secondary =
    "inline-flex items-center border hairline px-5 py-3 label text-bone-dim transition-colors hover:text-gold";

  return (
    <>
      <button type="button" onClick={downloadIcs} className={`${secondary} cursor-pointer`}>
        Agregar al calendario (.ics)
      </button>
      <a
        href={googleCalendarUrl({ start: startsAt, end: endsAt, summary, description, location: SITE.address })}
        target="_blank"
        rel="noopener noreferrer"
        className={secondary}
      >
        Abrir en Google Calendar →
      </a>
    </>
  );
}
