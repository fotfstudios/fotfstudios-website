"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useRef } from "react";
import type { ActionResult } from "./action";
import { useToast } from "./Toaster";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Formulario con feedback: corre la action, muestra toast de éxito/error y (opcional)
 * resetea, navega o cierra. El estado pending lo expone SubmitButton (useFormStatus).
 * Para acciones destructivas usa ConfirmForm.
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

  async function run(fd: FormData) {
    const result = await action(null, fd);
    if (result.ok) {
      if (success) toast({ tone: "ok", message: success });
      if (resetOnSuccess) ref.current?.reset();
      if (navigateTo) router.push(navigateTo);
      onDone?.();
    } else {
      toast({ tone: "error", message: result.error });
    }
  }

  return (
    <form ref={ref} action={run} className={className}>
      {children}
    </form>
  );
}
