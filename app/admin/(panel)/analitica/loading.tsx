import { Skeleton } from "@/components/admin/ui/Skeleton";
import { SkeletonCard, SkeletonPageHeader, SkeletonStatGrid } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando analíticas">
      <span className="sr-only">Cargando…</span>
      <SkeletonPageHeader />
      <div className="mt-6 flex gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-20" />
        ))}
      </div>
      <div className="mt-8">
        <SkeletonStatGrid />
      </div>
      <div className="mt-8 space-y-3">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={5} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}
