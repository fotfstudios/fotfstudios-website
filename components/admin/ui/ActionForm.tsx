"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ActionResult } from "./action";
import { useToast } from "./Toaster";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Formulario con feedback: corre la action, muestra el error inline (persistente) +
 * toast, y en éxito (opcional) resetea, navega o cierra. El error inline es clave: el
 * toast se auto-oculta y React 19 limpia el form al enviar, así que sin él un fallo
 * queda invisible. El estado pending lo expone SubmitButton (useFormStatus). Para
 * acciones destructivas usa ConfirmForm.
 */
export function ActionForm({
  action,
  children,
  success,
  className,
  resetOnSuccess,
  navigateTo,
  onDone,
}: {
  action: Action;
  children: ReactNode;
  success?: string;
  className?: string;
  resetOnSuccess?: boolean;
  navigateTo?: string;
  onDone?: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [error, setError] = useState<string | null>(null);

  // El error puede quedar bajo el botón en forms largos: acércalo a la vista.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  async function run(fd: FormData) {
    setError(null);
    const result = await action(null, fd);
    if (result.ok) {
      if (success) toast({ tone: "ok", message: success });
      if (resetOnSuccess) ref.current?.reset();
      if (navigateTo) router.push(navigateTo);
      onDone?.();
    } else {
      setError(result.error);
      toast({ tone: "error", message: result.error });
    }
  }

  return (
    <form ref={ref} action={run} className={className}>
      {children}
      {error && (
        <p ref={errorRef} role="alert" className="flex items-start gap-2 border border-sirena/40 bg-sirena/10 px-3 py-2.5 label-sm text-sirena">
          {error}
        </p>
      )}
    </form>
  );
}
