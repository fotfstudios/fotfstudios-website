import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader, SkeletonStatGrid, SkeletonTable } from "@/components/admin/ui/skeletons";

/** Fallback del dashboard (/admin): KPIs + una sección de tabla. */
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando el panel">
      <SkeletonPageHeader action />
      <div className="mt-8">
        <SkeletonStatGrid />
      </div>
      <div className="mt-10">
        <Skeleton className="h-3 w-32" />
        <div className="mt-3">
          <SkeletonTable rows={5} cols={5} />
        </div>
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
