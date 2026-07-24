import { SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

/** Fallback de /admin/postulaciones: encabezado + tabla. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando postulaciones">
      <SkeletonPageHeader />
      <div className="mt-8">
        <SkeletonTable rows={6} cols={6} />
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
