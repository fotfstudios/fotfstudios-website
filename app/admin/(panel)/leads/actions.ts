"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/components/admin/ui/action";
import { leadService, leadsRepository } from "@/src/composition";
import { isLeadStage } from "@/src/domain/outreach/pipeline";
import { normalizeEmail } from "@/src/domain/contact/contact";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const email = (fd: FormData): string => {
  const e = normalizeEmail(String(fd.get("email") ?? ""));
  if (!e) throw new Error("Correo inválido.");
  return e;
};

/** Mueve la etapa del embudo (manual, reversible). Lo usan la tabla y el tablero. */
export async function setLeadStageAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("leads.manage");
    const stage = String(fd.get("stage") ?? "").trim();
    if (!isLeadStage(stage)) throw new Error("Etapa inválida.");
    await leadService().setStage(email(fd), stage);
    revalidatePath("/admin/leads");
  });
}

/** Asigna (o desasigna con valor vacío) un miembro responsable. */
export async function assignLeadAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("leads.manage");
    const member = String(fd.get("memberId") ?? "").trim();
    await leadService().assign(email(fd), member === "" ? null : member);
    revalidatePath("/admin/leads");
  });
}

export async function setLeadNotesAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("leads.manage");
    await leadService().setNotes(email(fd), String(fd.get("notes") ?? "").slice(0, 2000));
    revalidatePath("/admin/leads");
  });
}

/** Alta manual de un lead (origen 'manual'); opcionalmente lo inscribe en la secuencia. */
export async function addLeadAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("leads.manage");
    const e = email(fd);
    const name = String(fd.get("name") ?? "").trim() || null;
    const phone = String(fd.get("phone") ?? "").trim() || null;
    await leadService().capture(
      { email: e, name, phone, source: "manual", kind: "manual" },
      fd.get("enroll") === "on" ? { source: "manual" } : undefined,
    );
    revalidatePath("/admin/leads");
  });
}

/** Inscribe / reinscribe en nurture (limpia una baja previa y su supresión). */
export async function enrollLeadAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("leads.manage");
    await leadService().enroll(email(fd), "manual");
    revalidatePath("/admin/leads");
  });
}

/** Da de baja (pausa) la secuencia y suprime el correo globalmente. */
export async function pauseLeadAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await requirePermission("leads.manage");
    await leadsRepository().pauseNurture(email(fd));
    revalidatePath("/admin/leads");
  });
}
