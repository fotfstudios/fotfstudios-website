"use client";

import { useEffect, useState } from "react";
import {
  consentUpdateSignals,
  type ConsentValue,
  parseConsent,
  serializeConsent,
  STORAGE_KEY,
} from "@/lib/consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Banner de consentimiento (Aceptar/Rechazar). Aparece si no hay elección guardada. */
export default function ConsentBanner() {
  const [open, setOpen] = useState(() => !parseConsent(localStorage.getItem(STORAGE_KEY)));

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener("open-consent", reopen);
    return () => window.removeEventListener("open-consent", reopen);
  }, []);

  const choose = (analytics: ConsentValue) => {
    // gtag global lo define el script consent-default (beforeInteractive).
    window.gtag?.("consent", "update", consentUpdateSignals(analytics));
    localStorage.setItem(STORAGE_KEY, serializeConsent(analytics, Date.now()));
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentimiento de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t hairline bg-ink/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between md:px-10">
        <p className="max-w-2xl text-sm text-bone-dim">
          Usamos cookies para medir el tráfico del sitio y mejorar tu experiencia.{" "}
          <a href="/privacidad" className="text-gold underline-offset-4 hover:underline">
            Más información
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="border hairline px-5 py-2.5 label-sm text-bone-dim transition-colors hover:border-gold hover:text-gold"
          >
            Rechazar
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="bg-gold px-5 py-2.5 label-sm text-ink transition-transform"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
