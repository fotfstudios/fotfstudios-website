import type { ActionResult } from "@/components/admin/ui/action";
import { ActionForm } from "@/components/admin/ui/ActionForm";
import { Input } from "@/components/admin/ui/Field";
import { btn } from "@/components/admin/ui/styles";
import { SubmitButton } from "@/components/admin/ui/SubmitButton";

export type RecordFolioAction = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * El control "Registrar folio" que comparten la card de la ficha y la tabla de la
 * cola: mismo FormData (docId, folio, backPath), misma validación nativa y mismo
 * botón. La app no emite nada — solo anota el folio que el SII asignó.
 * `mode="fix"` es la variante de corrección (folio precargado, botón secundario).
 */
export function FolioForm({
  docId,
  action,
  backPath,
  mode = "record",
  defaultValue,
}: {
  docId: string;
  action: RecordFolioAction;
  backPath: string;
  mode?: "record" | "fix";
  defaultValue?: string | null;
}) {
  const fix = mode === "fix";
  return (
    <ActionForm action={action} success={fix ? "Folio corregido." : "Folio registrado."}>
      <input type="hidden" name="docId" value={docId} />
      <input type="hidden" name="backPath" value={backPath} />
      <div className="flex items-center gap-2">
        <Input
          name="folio"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          aria-label={fix ? "Folio SII corregido" : "Folio SII"}
          placeholder="N° folio"
          defaultValue={defaultValue ?? undefined}
          className="min-w-28 max-w-40"
        />
        <SubmitButton size="sm" variant={fix ? "secondary" : "primary"}>
          {fix ? "Guardar" : "Registrar folio"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

/**
 * Una NC cuya boleta aún no tiene folio: el control se VE deshabilitado (inputCls),
 * pero el guard real está en TaxDocService, no acá.
 */
export function BlockedFolioControl() {
  return (
    <div className="flex items-center gap-2">
      <Input disabled aria-label="Folio SII (bloqueado)" placeholder="N° folio" className="min-w-28 max-w-40" />
      <button type="button" disabled className={btn("primary", "sm")}>
        Registrar folio
      </button>
    </div>
  );
}
