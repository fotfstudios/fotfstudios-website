/** Bloque skeleton reutilizable (barrido neutro). Server-safe: sin "use client". */
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}
