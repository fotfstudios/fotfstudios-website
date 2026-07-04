import { SkeletonPageHeader, SkeletonStatGrid, SkeletonTable } from "@/components/admin/ui/skeletons";

export default function Loading() {
  return (
    <div className="space-y-8">
      <SkeletonPageHeader action />
      <SkeletonStatGrid count={3} />
      <SkeletonTable rows={5} cols={4} />
    </div>
  );
}
