/** Bloque neutro con shimmer (usa `.skeleton` de globals.css; respeta prefers-reduced-motion). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}
