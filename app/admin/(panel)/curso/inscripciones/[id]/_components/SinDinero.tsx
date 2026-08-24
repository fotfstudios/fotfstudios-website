"use client";

import { useState } from "react";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Button } from "@/components/admin/ui/Button";
import { Card } from "@/components/admin/ui/Card";
import { Dialog } from "@/components/admin/ui/Dialog";
import { Field, Input, Select } from "@/components/admin/ui/Field";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";
import { substituteStudentAction, transferEnrollmentAction } from "../../../actions";

/**
 * Las dos salidas SIN dinero que ofrecen los términos bajo el corte de 7 días.
 * Van juntas y separadas del cobro porque comparten lo esencial: la plata no se
 * mueve, así que no hay nota de crédito ni boleta nueva.
 */
export function SinDinero({
  enrollmentId,
  studentName,
  destinos,
}: {
  enrollmentId: string;
  studentName: string;
  destinos: { id: string; code: string; name: string; seatsLeft: number }[];
}) {
  const [abierto, setAbierto] = useState<"traslado" | "reemplazo" | null>(null);
  const conCupo = destinos.filter((d) => d.seatsLeft > 0);

  return (
    <Card title="Sin mover dinero">
      <p className="mb-4 text-sm text-bone-dim">
        Lo que ofrecen los términos cuando no corresponde reembolso. El pedido y su boleta no se tocan.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAbierto("traslado")}>
          Traspasar a otra generación
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAbierto("reemplazo")}>
          Designar reemplazante
        </Button>
      </div>

      {abierto === "traslado" && (
        <Dialog title="Traspasar el cupo" onClose={() => setAbierto(null)}>
          {conCupo.length === 0 ? (
            <p className="text-sm text-bone-dim">
              No hay otra generación con cupos libres. Crea una nueva desde Generaciones.
            </p>
          ) : (
            <ActionForm
              action={transferEnrollmentAction}
              success="Cupo traspasado."
              onDone={() => setAbierto(null)}
              className="flex flex-col gap-5"
            >
              <input type="hidden" name="enrollmentId" value={enrollmentId} />
              <Field label="Generación de destino">
                <Select name="targetGenerationId" defaultValue={conCupo[0].id}>
                  {conCupo.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} · {d.name} ({d.seatsLeft} {d.seatsLeft === 1 ? "cupo" : "cupos"})
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="label-sm text-bone-mute">
                {studentName} conserva lo pagado y su estado. No paga diferencia si esa generación
                cambió de precio.
              </p>
              <div>
                <SubmitButton pendingLabel="Traspasando…">Traspasar cupo</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Dialog>
      )}

      {abierto === "reemplazo" && (
        <Dialog title="Designar reemplazante" onClose={() => setAbierto(null)}>
          <ActionForm
            action={substituteStudentAction}
            success="Reemplazante designado."
            onDone={() => setAbierto(null)}
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <Input name="name" required maxLength={80} />
              </Field>
              <Field label="Email">
                <Input name="email" type="email" required maxLength={120} />
              </Field>
            </div>
            <Field label="WhatsApp" hint="Opcional.">
              <Input name="phone" maxLength={40} />
            </Field>
            <p className="label-sm text-bone-mute">
              Cambia quién asiste, no quién pagó: la boleta sigue a nombre de {studentName}.
            </p>
            <div>
              <SubmitButton pendingLabel="Guardando…">Designar reemplazante</SubmitButton>
            </div>
          </ActionForm>
        </Dialog>
      )}
    </Card>
  );
}
