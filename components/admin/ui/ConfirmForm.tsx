"use client";

import { useState } from "react";
import type { ActionResult } from "./action";
import { Dialog } from "./Dialog";
import { SubmitButton } from "./SubmitButton";
import { btn, type BtnSize, type BtnVariant } from "./styles";
import { useToast } from "./Toaster";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** Acción destructiva con confirmación: botón → diálogo → submit, con toast de resultado. */
export function ConfirmForm({
  action,
  hidden,
  trigger,
  title,
  message,
  cta,
  success,
}: {
  action: Action;
  hidden?: Record<string, string>;
  trigger: { label: string; variant?: BtnVariant; size?: BtnSize };
  title: string;
  message: string;
  cta: string;
  success?: string;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  async function run(fd: FormData) {
    const result = await action(null, fd);
    if (result.ok) {
      if (success) toast({ tone: "ok", message: success });
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
            <SubmitButton variant="danger" size="sm">
              {cta}
            </SubmitButton>
          </form>
        </Dialog>
      )}
    </>
  );
}
