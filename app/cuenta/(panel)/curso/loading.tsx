import { SkeletonCard, SkeletonPageHeader } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando tu curso">
      <span className="sr-only">Cargando…</span>
      <SkeletonPageHeader action />
      <div className="mt-8">
        <SkeletonCard lines={6} />
      </div>
    </div>
  );
}
