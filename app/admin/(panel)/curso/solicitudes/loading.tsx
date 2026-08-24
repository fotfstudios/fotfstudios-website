import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando solicitudes">
      <span className="sr-only">Cargando…</span>
      <SkeletonPageHeader action />
      <div className="mt-8 flex gap-6 border-b hairline pb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-24" />
        ))}
      </div>
      <div className="mt-6">
        <SkeletonTable rows={6} cols={7} />
      </div>
    </div>
  );
}
