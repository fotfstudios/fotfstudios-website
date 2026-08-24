import { SkeletonCard, SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando generaciones">
      <span className="sr-only">Cargando…</span>
      <SkeletonPageHeader />
      <div className="mt-8 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <SkeletonCard lines={8} />
        <SkeletonTable rows={4} cols={6} />
      </div>
    </div>
  );
}
