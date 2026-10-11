"use client";

import { useEffect, useState } from "react";
import { normalizeEmail } from "@/src/domain/contact/contact";

/**
 * ¿Este correo tiene Beatcoins? (`/api/checkout/login-hint`). Para ofrecerle al invitado
 * entrar con código y usarlos. Con debounce y recordado por correo durante la página; un
 * fallo queda como "no sugerir" (el checkout sigue igual).
 */
export function useLoginHint(email: string, enabled: boolean): boolean {
  const [hints, setHints] = useState<Record<string, boolean>>({});
  const normalized = enabled ? normalizeEmail(email) : null;
  const known = normalized === null || normalized in hints;

  useEffect(() => {
    if (!normalized || known) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/checkout/login-hint?email=${encodeURIComponent(normalized)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const d = (await res.json()) as { suggestLogin?: boolean };
        setHints((h) => ({ ...h, [normalized]: d.suggestLogin === true }));
      } catch {
        // abortado o sin red: no se sugiere
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [normalized, known]);

  return normalized ? hints[normalized] === true : false;
}
