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

const push: Push = ({ tone, message }) => {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, tone, message }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 4200);
};

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

const getSnapshot = () => toasts;
const getServerSnapshot = (): Toast[] => [];

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
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 border bg-ink px-4 py-3 text-sm shadow-lg ${
              t.tone === "error" ? "border-sirena/50 text-sirena" : "border-gold/40 text-bone"
            }`}
          >
            <span className={t.tone === "error" ? "text-sirena" : "text-gold"}>
              <Icon name={t.tone === "error" ? "alert" : "check"} size={16} />
            </span>
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
