import { SkeletonCard, SkeletonPageHeader } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/reservas/nueva: encabezado + formulario. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando el formulario">
      <SkeletonPageHeader />
      <div className="mt-8 max-w-xl">
        <SkeletonCard lines={5} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
