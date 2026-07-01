import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/**
 * Pantalla vacía: invitación a actuar, no relleno.
 * `size="default"` — página completa (primer uso). `size="compact"` — dentro de una sección
 * (sin resultados de un filtro, nada pendiente): menos alto, título e icono más chicos.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  size = "default",
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
  size?: "default" | "compact";
}) {
  const compact = size === "compact";
  return (
    <div className={`flex flex-col items-center justify-center border hairline text-center ${compact ? "px-4 py-10" : "px-6 py-16"}`}>
      {icon &&
        (compact ? (
          <Icon name={icon} size={18} className="text-bone-mute" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center border hairline text-bone-mute">
            <Icon name={icon} size={22} />
          </span>
        ))}
      <p className={`font-display text-bone ${compact ? "mt-3 text-lg" : "mt-4 text-2xl"}`}>{title}</p>
      {hint && <p className={`max-w-sm text-sm leading-relaxed text-bone-dim ${compact ? "mt-1" : "mt-1.5"}`}>{hint}</p>}
      {action && <div className={compact ? "mt-4" : "mt-6"}>{action}</div>}
    </div>
  );
}
