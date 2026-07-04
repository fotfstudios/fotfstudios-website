import { SkeletonPageHeader, SkeletonTable } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div className="space-y-8">
      <SkeletonPageHeader />
      <SkeletonTable rows={3} cols={4} />
      <SkeletonTable rows={5} cols={4} />
    </div>
  );
}
