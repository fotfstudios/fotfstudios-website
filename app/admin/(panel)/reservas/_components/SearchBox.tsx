"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { Icon } from "@/components/admin/ui/icons";
import { inputCls } from "@/components/admin/ui/styles";

/**
 * Búsqueda con debounce que escribe `?q=` en la URL (resetea la página y
 * conserva el resto de filtros). No controlado a propósito: el caret y el foco
 * sobreviven las navegaciones del server mientras se tipea; cuando `?q=`
 * cambia desde afuera (Limpiar filtros, back/forward) se re-sincroniza.
 */
export function SearchBox({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, startTransition] = useTransition();

  // Re-sincroniza SOLO si el input no tiene el foco (no pisar lo tipeado).
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement !== el && el.value !== defaultValue) el.value = defaultValue;
  }, [defaultValue]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const navigate = (raw: string) => {
    if (timer.current) clearTimeout(timer.current);
    // Los params se leen AL NAVEGAR (no de un snapshot del render): un click
    // en tab/tiempo/orden durante los 300 ms del debounce no debe perderse.
    const sp = new URLSearchParams(window.location.search);
    const value = raw.trim();
    if (value) sp.set("q", value);
    else sp.delete("q");
    sp.delete("p");
    const qs = sp.toString();
    startTransition(() => router.replace(`/admin/reservas${qs ? `?${qs}` : ""}`, { scroll: false }));
  };
  const schedule = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(value), 300);
  };

  return (
    <div className="relative">
      <Icon
        name="search"
        size={14}
        className={`pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 ${
          pending ? "animate-pulse text-gold" : "text-bone-mute"
        }`}
      />
      <input
        ref={inputRef}
        type="search"
        defaultValue={defaultValue}
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(e.currentTarget.value);
          if (e.key === "Escape" && inputRef.current) {
            inputRef.current.value = "";
            navigate("");
          }
        }}
        placeholder="Buscar cliente…"
        aria-label="Buscar por nombre, correo o teléfono"
        aria-busy={pending}
        className={`${inputCls} max-w-64 pl-9`}
      />
    </div>
  );
}
