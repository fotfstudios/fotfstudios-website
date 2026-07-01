import { SkeletonCard, SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/bloqueos: encabezado + formulario + lista. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando bloqueos">
      <SkeletonPageHeader />
      <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <SkeletonCard lines={4} />
        <SkeletonTable rows={4} cols={3} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
