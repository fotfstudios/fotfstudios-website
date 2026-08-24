import { SkeletonCard, SkeletonPageHeader } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando inscripción">
      <span className="sr-only">Cargando…</span>
      <SkeletonPageHeader action />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </div>
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}
