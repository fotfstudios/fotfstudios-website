"use client";

import { useState } from "react";
import { Button } from "@/components/admin/ui/Button";
import { CopyButton } from "@/components/admin/ui/CopyButton";
import { useToast } from "@/components/admin/ui/Toaster";
import { shareCoursePaymentLinkAction } from "../../../actions";

/**
 * Genera el link de Mercado Pago y lo deja a mano. El email al alumno sale solo;
 * el link visible es para cuando el dueño prefiere pegarlo por WhatsApp.
 */
export function LinkDePago({ enrollmentId, waDigits }: { enrollmentId: string; waDigits: string | null }) {
  const [initPoint, setInitPoint] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  async function generar() {
    setPending(true);
    try {
      const r = await shareCoursePaymentLinkAction(enrollmentId);
      if (!r.ok) {
        toast({ tone: "error", message: r.error });
        return;
      }
      setInitPoint(r.data.initPoint);
      toast({ tone: "ok", message: "Link generado y enviado por email." });
    } finally {
      setPending(false);
    }
  }

  if (!initPoint) {
    return (
      <Button variant="secondary" size="sm" icon="external" onClick={generar} disabled={pending}>
        {pending ? "Generando…" : "Generar link de pago"}
      </Button>
    );
  }

  const waHref = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Tu cupo en el Curso de DJ. Paga acá: ${initPoint}`)}`
    : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="label-sm text-bone-mute">Link enviado por email. Vence en 72 h.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button href={initPoint} size="sm" icon="external" variant="secondary">
          Abrir link
        </Button>
        {waHref && (
          <Button href={waHref} size="sm" icon="whatsapp" variant="ghost">
            Enviar por WhatsApp
          </Button>
        )}
        <CopyButton value={initPoint} label="Copiar link" />
      </div>
    </div>
  );
}
