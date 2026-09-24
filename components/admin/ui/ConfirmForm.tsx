"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ActionResult } from "./action";
import { Dialog } from "./Dialog";
import { SubmitButton } from "./SubmitButton";
import { btn, type BtnSize, type BtnVariant } from "./styles";
import { useToast } from "./Toaster";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Acción que pide confirmación: botón → diálogo → submit, con toast de resultado.
 * Destructiva (borrar, cancelar) por defecto, pero también sirve para lo que SALE
 * del sistema sin vuelta atrás —mandarle un correo a un cliente—: ahí se pasa
 * `confirm="primary"`, porque Sirena está reservada a la urgencia real y un envío
 * amable no lo es.
 */
export function ConfirmForm({
  action,
  hidden,
  trigger,
  title,
  message,
  cta,
  confirm = "danger",
  success,
  navigateTo,
}: {
  action: Action;
  hidden?: Record<string, string>;
  trigger: { label: string; variant?: BtnVariant; size?: BtnSize };
  title: string;
  message: string;
  cta: string;
  /** Variante del botón que confirma. `danger` (Sirena) solo si de verdad destruye. */
  confirm?: BtnVariant;
  success?: string;
  /** Tras el éxito: a dónde ir (p. ej. la lista, cuando se borró la ficha actual). */
  navigateTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function run(fd: FormData) {
    const result = await action(null, fd);
    if (result.ok) {
      if (success) toast({ tone: "ok", message: success });
      if (navigateTo) router.push(navigateTo);
    } else {
      toast({ tone: "error", message: result.error });
    }
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={btn(trigger.variant ?? "danger", trigger.size ?? "sm")}
        onClick={() => setOpen(true)}
      >
        {trigger.label}
      </button>
      {open && (
        <Dialog title={title} onClose={() => setOpen(false)}>
          <p className="text-sm leading-relaxed text-bone-dim">{message}</p>
          <form action={run} className="mt-5 flex justify-end gap-3">
            {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <button type="button" onClick={() => setOpen(false)} className={btn("secondary", "sm")}>
              Cancelar
            </button>
            <SubmitButton variant={confirm} size="sm">
              {cta}
            </SubmitButton>
          </form>
        </Dialog>
      )}
    </>
  );
}
