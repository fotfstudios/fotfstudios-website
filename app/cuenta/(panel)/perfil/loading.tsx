import { SkeletonCard, SkeletonPageHeader } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div className="space-y-8">
      <SkeletonPageHeader />
      <SkeletonCard lines={4} className="max-w-md" />
    </div>
  );
}
