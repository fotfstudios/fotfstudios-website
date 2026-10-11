import { useEffect, useRef, type ReactNode } from "react";
import Button from "@/components/ds/Button";

/**
 * Barra fija del wizard móvil: qué se eligió, total, "Volver" y la acción del paso.
 * Publica su alto en `--fixed-bottom-offset` para que lo fijo que viene después (la línea
 * de cookies) se apoye encima en vez de taparla.
 */
export default function BottomBar({
  sub,
  totalLabel,
  onBack,
  action,
  under,
  error,
}: {
  sub: string;
  totalLabel: string;
  onBack: (() => void) | null;
  action: ReactNode;
  under: string;
  error: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--fixed-bottom-offset", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--fixed-bottom-offset");
    };
  }, []);

  return (
    <div ref={ref} className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-1.5 border-t border-[var(--border-subtle)] bg-[rgba(10,10,10,0.92)] px-4 pt-2.5 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur">
      {error && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="ds-mono truncate text-xs text-[var(--text-muted)]">{sub}</span>
          <span className="ds-mono text-xl leading-none">{totalLabel}</span>
        </div>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            Volver
          </Button>
        )}
        <div className="min-w-0 max-w-[60%] shrink-0">{action}</div>
      </div>
      <span className="text-[11px] text-[var(--text-muted)]">{under}</span>
    </div>
  );
}
