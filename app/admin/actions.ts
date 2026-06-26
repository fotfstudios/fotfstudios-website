"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminRepository, checkoutService } from "@/src/composition";
import { rangeFor } from "@/src/domain/scheduling/time";
import { requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

export async function cancelBookingAction(fd: FormData) {
  await requirePermission("reservations.cancel");
  const id = str(fd, "reservationId");
  await adminRepository().cancelBooking(id);
  revalidatePath(`/admin/reservas/${id}`);
  revalidatePath("/admin/reservas");
}

export async function recordBoletaAction(fd: FormData) {
  await requirePermission("reservations.boleta");
  const docId = str(fd, "docId");
  const folio = str(fd, "folio");
  const reservationId = str(fd, "reservationId");
  if (folio) await adminRepository().recordBoleta(docId, folio, null);
  revalidatePath(`/admin/reservas/${reservationId}`);
}

export async function markAccessAction(fd: FormData) {
  await requirePermission("reservations.access");
  const reservationId = str(fd, "reservationId");
  const code = str(fd, "code");
  if (code) await adminRepository().markAccess(reservationId, code);
  revalidatePath(`/admin/reservas/${reservationId}`);
}

export async function createManualBookingAction(fd: FormData) {
  await requirePermission("reservations.create");
  const repo = adminRepository();
  const resource = await repo.defaultResource();
  if (!resource) throw new Error("sin recurso");

  const booking = await checkoutService().createBooking({
    resourceId: resource.id,
    date: str(fd, "date"),
    startMinute: num(fd, "startMinute"),
    durationHours: num(fd, "durationHours"),
    addonKeys: [],
    customer: {
      name: str(fd, "name") || undefined,
      email: str(fd, "email") || undefined,
      phone: str(fd, "phone") || undefined,
    },
  });
  if (!booking.ok) throw new Error(booking.error === "slot_taken" ? "Horario ocupado" : booking.error);

  await repo.confirmOffline(booking.value.orderId, str(fd, "method") || "efectivo");
  revalidatePath("/admin/reservas");
  redirect("/admin/reservas");
}

export async function createBlockAction(fd: FormData) {
  await requirePermission("blocks.manage");
  const repo = adminRepository();
  const resource = await repo.defaultResource();
  if (!resource) throw new Error("sin recurso");
  const { startsAt, endsAt } = rangeFor(
    str(fd, "date"),
    num(fd, "startMinute"),
    num(fd, "durationHours"),
    resource.timezone,
  );
  await repo.createBlock(resource.id, startsAt, endsAt); // lanza "overlap" si choca
  revalidatePath("/admin/bloqueos");
}

export async function deleteBlockAction(fd: FormData) {
  await requirePermission("blocks.manage");
  await adminRepository().deleteBlock(str(fd, "id"));
  revalidatePath("/admin/bloqueos");
}
