import { fmtDateTime } from "@/components/admin/format";
import { Card } from "@/components/admin/ui/Card";
import { ConfirmForm } from "@/components/admin/ui/ConfirmForm";
import { MeterCell } from "@/components/admin/ui/MeterCell";
import { releasePracticeAction } from "../../../actions";
import { AgendarPracticaDialog } from "./AgendarPracticaDialog";

/**
 * Las horas de práctica libre, como saldo. No se pre-bloquean: se materializan
 * como reserva recién al agendarlas, y ahí recién ocupan la cabina.
 */
export function Practica({
  enrollmentId,
  total,
  redeemed,
  redemptions,
  tz,
}: {
  enrollmentId: string;
  total: number;
  redeemed: number;
  redemptions: { id: string; reservationId: string; hours: number; startsAt: string | null; releasedAt: string | null }[];
  tz: string;
}) {
  const libres = Math.max(0, total - redeemed);
  const vivas = redemptions.filter((r) => !r.releasedAt);

  return (
    <Card title="Práctica libre">
      <MeterCell
        pct={total > 0 ? (redeemed / total) * 100 : 0}
        label={`${libres} de ${total} ${total === 1 ? "hora" : "horas"} disponibles`}
      />

      {vivas.length > 0 && (
        <ul className="mt-5 flex flex-col border-t hairline pt-4">
          {vivas.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t hairline py-3 first:border-0 first:pt-0">
              <span className="font-mono text-sm text-bone-dim">
                {r.startsAt ? fmtDateTime(r.startsAt) : "—"}
                <span className="ml-2 text-bone-quiet">
                  {r.hours} {r.hours === 1 ? "hora" : "horas"}
                </span>
              </span>
              <ConfirmForm
                action={releasePracticeAction}
                hidden={{ enrollmentId, reservationId: r.reservationId }}
                trigger={{ label: "Cancelar", variant: "ghost", size: "sm" }}
                title="Cancelar la práctica"
                message="El horario vuelve a estar disponible y la hora regresa al saldo del alumno."
                cta="Cancelar práctica"
                success="Práctica cancelada."
              />
            </li>
          ))}
        </ul>
      )}

      {libres > 0 ? (
        <div className="mt-5 border-t hairline pt-5">
          <AgendarPracticaDialog enrollmentId={enrollmentId} libres={libres} tz={tz} />
        </div>
      ) : (
        <p className="mt-5 border-t hairline pt-4 label-sm text-bone-quiet">
          {total === 0 ? "Esta inscripción no incluye horas de práctica." : "Ya usó todas sus horas."}
        </p>
      )}
    </Card>
  );
}
