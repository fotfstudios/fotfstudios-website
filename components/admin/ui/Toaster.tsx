"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { Icon } from "./icons";

type Tone = "ok" | "error";
type Toast = { id: number; tone: Tone; message: string };
type Push = (t: { tone: Tone; message: string }) => void;

/**
 * Store a nivel de módulo (fuera del árbol de React). Motivo: cuando una server
 * action hace `revalidatePath` de la RUTA ACTUAL, Next re-renderiza la página al
 * resolver la action y un toast guardado como estado del componente se pierde en
 * esa reconciliación (el patrón toast-tras-action quedaba invisible en toda
 * página que revalida su propio path). Con el store externo + useSyncExternalStore,
 * el Toaster —aunque se re-monte— siempre lee los toasts vigentes.
 */
let toasts: Toast[] = [];
const subscribers = new Set<() => void>();

function emit(): void {
  for (const fn of subscribers) fn();
}

function dismiss(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const push: Push = ({ tone, message }) => {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, tone, message }];
  emit();
  // Solo el éxito se auto-oculta: un error que desaparece a los 4 s se pierde si no
  // se estaba mirando (WCAG 2.2.1); queda hasta que se cierre con la X.
  if (tone === "ok") setTimeout(() => dismiss(id), 4200);
};

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

const getSnapshot = () => toasts;
// Referencia estable: React exige que el snapshot de servidor no cambie entre
// llamadas (un `[]` nuevo por llamada dispara el warning de loop infinito).
const EMPTY: Toast[] = [];
const getServerSnapshot = () => EMPTY;

/** Dispara toasts de éxito/error desde cualquier client component del admin. */
export function useToast(): Push {
  return push;
}

export function Toaster({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-2.5 border bg-ink px-4 py-3 text-sm shadow-lg ${
              t.tone === "error" ? "border-sirena/50 text-sirena" : "border-gold/40 text-bone"
            }`}
          >
            <span className={t.tone === "error" ? "text-sirena" : "text-gold"}>
              <Icon name={t.tone === "error" ? "alert" : "check"} size={16} />
            </span>
            <span className="flex-1 leading-snug">{t.message}</span>
            {t.tone === "error" && (
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar"
                className="-m-2 p-2 text-sirena/70 transition-colors hover:text-sirena"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
