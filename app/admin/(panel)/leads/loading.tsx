import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando leads">
      <span className="sr-only">Cargando…</span>
      <SkeletonPageHeader />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="mt-8">
        <SkeletonTable rows={6} cols={6} />
      </div>
    </div>
  );
}
