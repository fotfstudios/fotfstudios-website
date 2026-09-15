import { revalidatePath } from "next/cache";
import { taxDocService } from "@/src/composition";
import { currentClaims, requirePermission } from "@/src/infrastructure/auth/require-admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cuerpo compartido de las tres server actions "Registrar folio" (reserva, curso,
 * cola SII). La app no emite nada: el dueño emite en sii.cl y acá se anota el folio.
 * Validación, guard de NC bloqueada y evento de timeline viven en TaxDocService;
 * acá solo permiso, campos del formulario y revalidación. `backPath` es la página
 * que mostró el formulario; se revalida junto a la cola y el panel, que cuentan
 * pendientes. Las actions siguen siendo locales a cada segmento (CLAUDE.md): cada
 * una es un wrapper de tres líneas sobre esta función.
 */
export async function recordTaxDocFolioFromForm(fd: FormData): Promise<void> {
  await requirePermission("reservations.boleta");
  const docId = str(fd, "docId");
  const backPath = str(fd, "backPath");
  if (!/^\/admin(\/|$)/.test(backPath)) throw new Error("Ruta inválida.");
  if (!UUID_RE.test(docId)) throw new Error("Documento no encontrado.");
  const actor = (await currentClaims())?.sub ?? null;
  await taxDocService().recordFolio(docId, str(fd, "folio"), actor);
  revalidatePath(backPath);
  revalidatePath("/admin/sii");
  revalidatePath("/admin");
}
