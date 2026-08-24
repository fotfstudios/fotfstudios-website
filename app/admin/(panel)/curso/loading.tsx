import { SkeletonCard, SkeletonPageHeader, SkeletonStatGrid, SkeletonTable } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando curso">
      <span className="sr-only">Cargando…</span>
      <SkeletonPageHeader action />
      <div className="mt-8">
        <SkeletonStatGrid />
      </div>
      <div className="mt-8">
        <SkeletonCard lines={2} />
      </div>
      <div className="mt-10">
        <SkeletonTable rows={4} cols={5} />
      </div>
    </div>
  );
}
