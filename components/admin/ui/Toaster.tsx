"use client";

import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { Icon } from "./icons";

type Tone = "ok" | "error";
type Toast = { id: number; tone: Tone; message: string };
type Push = (t: { tone: Tone; message: string }) => void;

const ToastCtx = createContext<Push>(() => {});

/** Dispara toasts de éxito/error desde cualquier client component del admin. */
export function useToast(): Push {
  return useContext(ToastCtx);
}

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback<Push>(({ tone, message }) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
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
    </ToastCtx.Provider>
  );
}
