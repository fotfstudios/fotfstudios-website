import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando leads">
      <span className="sr-only">Cargando…</span>
      <SkeletonPageHeader action />
      <div className="mt-8 flex items-center justify-between">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mt-6">
        <SkeletonTable rows={6} cols={5} />
      </div>
    </div>
  );
}
