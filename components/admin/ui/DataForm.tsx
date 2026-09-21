"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ActionDataResult } from "./action";
import { useToast } from "./Toaster";

/**
 * Como ActionForm, pero para actions que DEVUELVEN algo (`runData`) y el caller decide qué
 * hacer con eso (navegar a la ficha creada, al ítem separado…). Mismo contrato de error:
 * inline persistente + toast, porque React 19 limpia el form al enviar.
 */
export function DataForm<T>({
  action,
  onSuccess,
  children,
  className,
}: {
  action: (fd: FormData) => Promise<ActionDataResult<T>>;
  onSuccess: (data: T) => void;
  children: ReactNode;
  className?: string;
}) {
  const toast = useToast();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  async function run(fd: FormData) {
    setError(null);
    const result = await action(fd);
    if (result.ok) onSuccess(result.data);
    else {
      setError(result.error);
      toast({ tone: "error", message: result.error });
    }
  }

  return (
    <form action={run} className={className}>
      {children}
      {error && (
        <p ref={errorRef} role="alert" className="flex items-start gap-2 border border-sirena/40 bg-sirena/10 px-3 py-2.5 label-sm text-sirena">
          {error}
        </p>
      )}
    </form>
  );
}
